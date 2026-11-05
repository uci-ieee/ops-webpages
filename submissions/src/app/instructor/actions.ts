"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reviews, submissions } from "@/lib/db/schema";
import { requireActorRole } from "@/lib/preview";
import { instructorCanSeeStudent } from "@/lib/queries";
import { RETENTION, daysFromNow } from "@/lib/submissions";

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

  // Latest verdict wins; no need to keep a chain of re-reviews.
  await db.delete(reviews).where(eq(reviews.submissionId, submission.id));
  await db.insert(reviews).values({
    submissionId: submission.id,
    // Carried so the verdict still makes sense if the submission is deleted.
    studentId: submission.studentId,
    deliverableId: submission.deliverableId,
    reviewerId: actor.id,
    status: rawStatus,
    comment,
  });

  await db
    .update(submissions)
    .set({ purgeAfter: daysFromNow(RETENTION.afterReviewDays) })
    .where(eq(submissions.id, submission.id));

  revalidatePath("/instructor");
  revalidatePath(`/instructor/student/${submission.studentId}`);
  revalidatePath("/");

  return { ok: true };
}
