"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { requireActor } from "@/lib/preview";
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

  if (deliverable.maxSeconds !== null) {
    if (input.durationSeconds === null) {
      return {
        ok: false,
        error: "We could not read the length of that video. Try re-exporting it as MP4.",
      };
    }
    // Allow a little slack so a 60.4s clip is not rejected on a rounding error.
    if (input.durationSeconds > deliverable.maxSeconds + 1) {
      return {
        ok: false,
        error: `That video is ${Math.round(input.durationSeconds)}s, over the ${deliverable.maxSeconds}s limit. Trim it and try again.`,
      };
    }
  }

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
      durationSeconds: input.durationSeconds,
      // Backstop until an instructor reviews it, which reschedules the purge.
      purgeAfter: daysFromNow(RETENTION.backstopDays),
    });
  } catch (e) {
    // The unique (deliverable, student, version) index catches a double submit.
    await deleteObject(key).catch(() => {});
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("submissions_deliverable_student_version_key")) {
      return { ok: false, error: "That upload was already recorded. Reload the page." };
    }
    return { ok: false, error: "Could not record that submission. Try again." };
  }

  revalidatePath("/");
  revalidatePath("/instructor");
  return { ok: true };
}
