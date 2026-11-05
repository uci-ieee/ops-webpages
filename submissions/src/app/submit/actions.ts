"use server";

import { revalidatePath } from "next/cache";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reviews, submissions } from "@/lib/db/schema";
import { requireActor } from "@/lib/preview";
import { instructorCanSeeStudent } from "@/lib/queries";
import { checkQuotaFor } from "@/lib/quota";
import {
  RETENTION,
  daysFromNow,
  getDeliverable,
  nextVersion,
} from "@/lib/submissions";
import {
  deleteObject,
  extensionOf,
  formatBytes,
  objectKey,
  presignUpload,
  verifyUploadedObject,
} from "@/lib/storage";

export type DeleteResult = { ok: true } | { ok: false; error: string };

/**
 * Delete a submission outright -- the stored file and the row.
 *
 * Who may delete what:
 *   student    their own submissions only
 *   instructor submissions by students in sections assigned to them
 *   admin      anything
 *
 * The file is removed first and a failure there is tolerated, because the
 * object may already be gone (purged, or deleted directly in Cloudflare). A
 * missing file must not strand the row that points at it.
 */
export async function deleteSubmission(input: { submissionId: string }): Promise<DeleteResult> {
  const actor = await requireActor();
  const db = getDb();

  const rows = await db
    .select({
      id: submissions.id,
      studentId: submissions.studentId,
      deliverableId: submissions.deliverableId,
      storageKey: submissions.storageKey,
      supersededAt: submissions.supersededAt,
    })
    .from(submissions)
    .where(eq(submissions.id, input.submissionId))
    .limit(1);

  const submission = rows[0];
  if (!submission) return { ok: false, error: "That submission no longer exists." };

  if (actor.role === "student") {
    if (submission.studentId !== actor.id) {
      return { ok: false, error: "That is not your submission." };
    }

    /**
     * A student may remove their own work, but not once it has been assessed.
     * Otherwise a student could delete an approved submission and take the
     * grade with it, which is exactly the kind of quiet data loss this is
     * meant to prevent.
     */
    const reviewed = await db
      .select({ id: reviews.id })
      .from(reviews)
      .where(eq(reviews.submissionId, submission.id))
      .limit(1);

    if (reviewed.length > 0) {
      return {
        ok: false,
        error:
          "An instructor has already reviewed this submission, so it cannot be deleted. " +
          "Upload a new file instead -- that replaces it and keeps the record intact. " +
          "If it genuinely needs removing, ask an instructor.",
      };
    }
  } else if (actor.role === "instructor") {
    const allowed = await instructorCanSeeStudent(actor.id, submission.studentId);
    if (!allowed) return { ok: false, error: "That student is not in one of your sections." };
  }

  await deleteObject(submission.storageKey).catch(() => {
    /* already gone; the row still needs clearing */
  });

  const wasCurrent = submission.supersededAt === null;
  // reviews cascade from submissions.
  await db.delete(submissions).where(eq(submissions.id, submission.id));

  // If the current attempt was the one removed, promote the newest remaining
  // version back to current. Otherwise the deliverable would read "not
  // submitted" while earlier attempts still existed.
  if (wasCurrent) {
    const remaining = await db
      .select({ id: submissions.id })
      .from(submissions)
      .where(
        and(
          eq(submissions.deliverableId, submission.deliverableId),
          eq(submissions.studentId, submission.studentId),
        ),
      )
      .orderBy(desc(submissions.version))
      .limit(1);

    if (remaining[0]) {
      await db
        .update(submissions)
        .set({ supersededAt: null, purgeAfter: daysFromNow(RETENTION.backstopDays) })
        .where(eq(submissions.id, remaining[0].id));
    }
  }

  revalidatePath("/");
  revalidatePath("/instructor");
  revalidatePath(`/instructor/student/${submission.studentId}`);
  revalidatePath("/admin");
  return { ok: true };
}

/**
 * Durations arrive as floats from the browser (HTMLMediaElement.duration), and
 * the column is an integer. Also guards NaN and Infinity, which some containers
 * report for streams whose length the browser cannot determine.
 */
function toWholeSeconds(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return Math.round(value);
}

export type UploadTicket =
  | { ok: true; url: string; version: number; maxBytes: number }
  | { ok: false; error: string };

export type ConfirmResult = { ok: true } | { ok: false; error: string };

/**
 * Step 1 of 2. Validates what the browser says it is about to upload and hands
 * back a presigned PUT so the file goes straight to storage. Nothing is
 * recorded yet -- an abandoned upload leaves no row.
 */
export async function requestUpload(input: {
  deliverableId: number;
  filename: string;
  contentType: string;
  size: number;
  durationSeconds: number | null;
}): Promise<UploadTicket> {
  const actor = await requireActor();
  if (actor.role !== "student") {
    return { ok: false, error: "Only students submit work." };
  }

  const deliverable = await getDeliverable(input.deliverableId);
  if (!deliverable) return { ok: false, error: "That deliverable does not exist." };

  // Hiding a project has to actually close it. The student page filters on
  // published, but a stale tab or a guessed deliverable id would otherwise
  // still reach this endpoint.
  if (!deliverable.published) {
    return {
      ok: false,
      error: `${deliverable.projectLabel} is not open for submissions yet.`,
    };
  }

  const ext = extensionOf(input.filename);
  if (!deliverable.allowedExtensions.includes(ext)) {
    return {
      ok: false,
      error: `That file type is not accepted here. Allowed: ${deliverable.allowedExtensions.join(", ")}.`,
    };
  }

  if (input.size > deliverable.maxBytes) {
    return {
      ok: false,
      error:
        `That file is ${formatBytes(input.size)}, over the ${formatBytes(deliverable.maxBytes)} limit. ` +
        (deliverable.kind === "video"
          ? "Record at a lower resolution (720p is plenty) or trim the clip."
          : "Try a smaller file."),
    };
  }

  /**
   * An unknown duration is accepted rather than refused. Chrome routinely
   * fails to read metadata from iPhone .mov files, and rejecting those left
   * students simply unable to submit. The size cap still bounds the upload, so
   * the worst case is a slightly over-length clip rather than a blocked one.
   */
  if (deliverable.maxSeconds !== null && input.durationSeconds !== null) {
    // A little slack so a 60.4s clip is not rejected on a rounding error.
    if (input.durationSeconds > deliverable.maxSeconds + 1) {
      return {
        ok: false,
        error: `That video is ${Math.round(input.durationSeconds)}s, over the ${deliverable.maxSeconds}s limit. Trim it and try again.`,
      };
    }
  }

  // Hard ceiling on total stored bytes. Checked before a presigned URL exists,
  // so a submission that would cross the line never gets a way to upload.
  const quota = await checkQuotaFor(input.size);
  if (!quota.ok) return { ok: false, error: quota.reason };

  const version = await nextVersion(input.deliverableId, actor.id);
  const key = objectKey({
    year: deliverable.year,
    projectSlug: deliverable.projectSlug,
    ucinetid: actor.ucinetid,
    deliverableId: deliverable.id,
    version,
    filename: input.filename,
  });

  const url = await presignUpload({ key, contentType: input.contentType });
  return { ok: true, url, version, maxBytes: deliverable.maxBytes };
}

/**
 * Step 2 of 2. Recomputes the object key from the signed-in user rather than
 * accepting one from the browser, so a confirmation can only ever point at this
 * student's own object. Then asks storage how big the file really is, because a
 * presigned PUT cannot enforce a byte limit.
 */
export async function confirmUpload(input: {
  deliverableId: number;
  version: number;
  filename: string;
  contentType: string;
  durationSeconds: number | null;
}): Promise<ConfirmResult> {
  const actor = await requireActor();
  if (actor.role !== "student") {
    return { ok: false, error: "Only students submit work." };
  }

  const deliverable = await getDeliverable(input.deliverableId);
  if (!deliverable) return { ok: false, error: "That deliverable does not exist." };

  const key = objectKey({
    year: deliverable.year,
    projectSlug: deliverable.projectSlug,
    ucinetid: actor.ucinetid,
    deliverableId: deliverable.id,
    version: input.version,
    filename: input.filename,
  });

  const check = await verifyUploadedObject({ key, maxBytes: deliverable.maxBytes });
  if (!check.ok) return { ok: false, error: check.reason };

  const db = getDb();

  try {
    // Supersede whatever was current. The file is kept for a short window so an
    // instructor can still download the previous attempt, then purged.
    await db
      .update(submissions)
      .set({
        supersededAt: new Date(),
        purgeAfter: daysFromNow(RETENTION.supersededDays),
      })
      .where(
        and(
          eq(submissions.deliverableId, input.deliverableId),
          eq(submissions.studentId, actor.id),
          isNull(submissions.supersededAt),
        ),
      );

    await db.insert(submissions).values({
      deliverableId: input.deliverableId,
      studentId: actor.id,
      version: input.version,
      storageKey: key,
      filename: input.filename,
      bytes: check.facts.bytes,
      contentType: check.facts.contentType ?? input.contentType,
      // duration_seconds is an integer column and HTMLMediaElement.duration is
      // fractional, so an unrounded value is rejected outright by Postgres
      // ("invalid input syntax for type integer").
      durationSeconds: toWholeSeconds(input.durationSeconds),
      // Backstop until an instructor reviews it, which reschedules the purge.
      purgeAfter: daysFromNow(RETENTION.backstopDays),
    });
  } catch (e) {
    // The object is already in storage at this point, so drop it rather than
    // leaving an orphan that counts against the storage quota forever.
    await deleteObject(key).catch(() => {});

    const msg = e instanceof Error ? e.message : String(e);
    // Surface the real cause in the server log; the student gets plain English.
    console.error("[confirmUpload] insert failed", {
      deliverableId: input.deliverableId,
      version: input.version,
      error: msg,
    });

    // The unique (deliverable, student, version) index catches a double submit.
    if (msg.includes("submissions_deliverable_student_version_key")) {
      return { ok: false, error: "That upload was already recorded. Reload the page." };
    }
    return {
      ok: false,
      error: "Your file uploaded but could not be recorded, so it was discarded. Try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/instructor");
  return { ok: true };
}
