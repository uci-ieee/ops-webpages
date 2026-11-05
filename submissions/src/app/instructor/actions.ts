"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reviews, submissions } from "@/lib/db/schema";
import { requireActorRole } from "@/lib/preview";
import { instructorCanSeeStudent } from "@/lib/queries";
import { RETENTION, daysFromNow, getDeliverable } from "@/lib/submissions";
import {
  drainCanvasSync,
  enqueueProjectGrade,
  projectIdForDeliverable,
} from "@/lib/canvas-sync";

export type ReviewResult = { ok: true } | { ok: false; error: string };

/**
 * Record a decision on a submission. Reviewing is also what schedules the file
 * for deletion: once an instructor has seen it, the clip has done its job and
 * only the verdict needs keeping.
 */
export async function reviewSubmission(
  _prev: ReviewResult | null,
  formData: FormData,
): Promise<ReviewResult> {
  const actor = await requireActorRole("instructor", "admin");

  const submissionId = String(formData.get("submissionId") ?? "");
  const rawStatus = String(formData.get("status") ?? "");
  const comment = String(formData.get("comment") ?? "").trim() || null;

  if (rawStatus !== "approved" && rawStatus !== "needs_work") {
    return { ok: false, error: "Pick approved or needs work." };
  }

  const rawScore = String(formData.get("score") ?? "").trim();

  const db = getDb();
  const rows = await db
    .select({
      id: submissions.id,
      studentId: submissions.studentId,
      deliverableId: submissions.deliverableId,
    })
    .from(submissions)
    .where(eq(submissions.id, submissionId))
    .limit(1);

  const submission = rows[0];
  if (!submission) return { ok: false, error: "That submission no longer exists." };

  // Scoping is enforced here, not only in the page that listed it -- an action
  // is a POST endpoint and must authorize independently.
  if (actor.role !== "admin") {
    const allowed = await instructorCanSeeStudent(actor.id, submission.studentId);
    if (!allowed) return { ok: false, error: "That student is not in one of your sections." };
  }

  // Score is optional, but must be sane when given: a mistyped value would be
  // pushed straight to the Canvas gradebook.
  const deliverable = await getDeliverable(submission.deliverableId);
  if (!deliverable) return { ok: false, error: "That deliverable no longer exists." };

  let score: number | null = null;
  if (rawScore !== "") {
    const parsed = Number(rawScore);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return { ok: false, error: "Score must be a whole number, or left blank." };
    }
    if (parsed > deliverable.pointsPossible) {
      return {
        ok: false,
        error: `Score cannot exceed ${deliverable.pointsPossible} for this deliverable.`,
      };
    }
    score = parsed;
  }

  // Latest verdict wins; no need to keep a chain of re-reviews.
  await db.delete(reviews).where(eq(reviews.submissionId, submission.id));
  await db.insert(reviews).values({
    submissionId: submission.id,
    // Carried so the verdict still makes sense if the submission is deleted.
    studentId: submission.studentId,
    deliverableId: submission.deliverableId,
    reviewerId: actor.id,
    status: rawStatus,
    score,
    comment,
  });

  await db
    .update(submissions)
    .set({ purgeAfter: daysFromNow(RETENTION.afterReviewDays) })
    .where(eq(submissions.id, submission.id));

  const projectId = await projectIdForDeliverable(submission.deliverableId);
  if (projectId !== null) {
    try {
      await enqueueProjectGrade(submission.studentId, projectId);
    } catch (e) {
      // Queueing is best-effort; the review itself is already saved.
      console.error("[review] could not queue Canvas sync", e);
    }

    /**
     * Push after the response is sent. The instructor's click lands
     * immediately and a slow or unreachable Canvas never blocks grading;
     * anything that fails stays queued and is retried by the daily sweep.
     */
    after(async () => {
      try {
        await drainCanvasSync(10);
      } catch (e) {
        console.error("[review] Canvas push failed; left queued for retry", e);
      }
    });
  }

  revalidatePath("/instructor");
  revalidatePath(`/instructor/student/${submission.studentId}`);
  revalidatePath("/");

  return { ok: true };
}
