import { and, asc, desc, eq, inArray, isNotNull, lt, or } from "drizzle-orm";
import { getDb } from "./db";
import { canvasSync, deliverables, projects, reviews, users } from "./db/schema";
import { canvasConfig, pushGrade } from "./canvas";

/**
 * Keeps Canvas in step with the grades recorded here.
 *
 * Canvas holds one grade per assignment, while this app reviews each
 * deliverable separately -- Project 2 has three videos. So a project's Canvas
 * grade is the sum of its deliverable scores, out of the sum of their points,
 * and it is re-pushed every time any one of them is reviewed.
 */

/** Give up after this many failed attempts and wait for a human. */
const MAX_ATTEMPTS = 5;

export type ProjectGrade = {
  score: number;
  pointsPossible: number;
  reviewedCount: number;
  deliverableCount: number;
  comment: string;
};

/**
 * The grade Canvas should hold for one student on one project, built from the
 * reviews recorded against that project's deliverables.
 */
export async function computeProjectGrade(
  studentId: string,
  projectId: number,
): Promise<ProjectGrade | null> {
  const db = getDb();

  /**
   * Deliberately two queries rather than one left join.
   *
   * A deliverable can carry several review rows: reviews outlive their
   * submission (so a grade is not lost when a file is deleted), which means a
   * resubmitted-and-regraded deliverable accumulates history. Joining would
   * fan out and count points_possible once per review -- a one-deliverable,
   * 10-point project reported 0/20 before this was fixed, and that wrong total
   * would have been pushed to Canvas.
   *
   * Only the most recent verdict per deliverable counts toward the grade.
   */
  const defs = await db
    .select({
      deliverableId: deliverables.id,
      label: deliverables.label,
      pointsPossible: deliverables.pointsPossible,
    })
    .from(deliverables)
    .where(eq(deliverables.projectId, projectId))
    .orderBy(asc(deliverables.position));

  if (defs.length === 0) return null;

  const reviewRows = await db
    .select({
      deliverableId: reviews.deliverableId,
      score: reviews.score,
      status: reviews.status,
      comment: reviews.comment,
      reviewedAt: reviews.reviewedAt,
    })
    .from(reviews)
    .where(
      and(
        eq(reviews.studentId, studentId),
        inArray(
          reviews.deliverableId,
          defs.map((d) => d.deliverableId),
        ),
      ),
    )
    .orderBy(desc(reviews.reviewedAt));

  // First row per deliverable wins, because the list is newest-first.
  const latest = new Map<number, (typeof reviewRows)[number]>();
  for (const row of reviewRows) {
    if (!latest.has(row.deliverableId)) latest.set(row.deliverableId, row);
  }

  let score = 0;
  let pointsPossible = 0;
  let reviewedCount = 0;
  const lines: string[] = [];

  for (const def of defs) {
    pointsPossible += def.pointsPossible;

    const review = latest.get(def.deliverableId);
    if (!review) continue;

    reviewedCount++;
    // A verdict with no score (recorded before scoring existed, or left blank)
    // contributes nothing rather than silently counting as zero.
    const awarded = review.score ?? 0;
    score += awarded;

    const verdict = review.status === "approved" ? "approved" : "needs work";
    lines.push(
      `${def.label}: ${awarded}/${def.pointsPossible} (${verdict})` +
        (review.comment ? ` - ${review.comment}` : ""),
    );
  }

  return {
    score,
    pointsPossible,
    reviewedCount,
    deliverableCount: defs.length,
    comment: lines.join("\n"),
  };
}

/**
 * Record that Canvas needs updating for this student and project. Does not
 * contact Canvas -- an instructor clicking Approve must not wait on it, or fail
 * because it is down.
 */
export async function enqueueProjectGrade(studentId: string, projectId: number): Promise<void> {
  const grade = await computeProjectGrade(studentId, projectId);
  if (!grade || grade.reviewedCount === 0) return;

  await getDb()
    .insert(canvasSync)
    .values({
      studentId,
      projectId,
      score: grade.score,
      pointsPossible: grade.pointsPossible,
      comment: grade.comment,
      status: "pending",
      attempts: 0,
      lastError: null,
    })
    .onConflictDoUpdate({
      target: [canvasSync.studentId, canvasSync.projectId],
      set: {
        score: grade.score,
        pointsPossible: grade.pointsPossible,
        comment: grade.comment,
        // Re-reviewing resets the queue entry, including a previously failed
        // one, so a fixed configuration gets retried without manual poking.
        status: "pending",
        attempts: 0,
        lastError: null,
        queuedAt: new Date(),
        syncedAt: null,
      },
    });
}

/** Which project a deliverable belongs to, for enqueueing after a review. */
export async function projectIdForDeliverable(deliverableId: number): Promise<number | null> {
  const rows = await getDb()
    .select({ projectId: deliverables.projectId })
    .from(deliverables)
    .where(eq(deliverables.id, deliverableId))
    .limit(1);
  return rows[0]?.projectId ?? null;
}

export type DrainReport = {
  configured: boolean;
  considered: number;
  pushed: number;
  failed: number;
  skipped: number;
  errors: string[];
};

/**
 * Push everything outstanding. Called by the cron sweep and from the admin
 * page. Rows that have failed MAX_ATTEMPTS times are left alone so a broken
 * assignment id does not generate traffic forever.
 */
export async function drainCanvasSync(limit = 100): Promise<DrainReport> {
  const db = getDb();
  const report: DrainReport = {
    configured: canvasConfig() !== null,
    considered: 0,
    pushed: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  if (!report.configured) return report;

  const due = await db
    .select({
      id: canvasSync.id,
      score: canvasSync.score,
      comment: canvasSync.comment,
      attempts: canvasSync.attempts,
      ucinetid: users.ucinetid,
      assignmentId: projects.canvasAssignmentId,
      projectLabel: projects.label,
    })
    .from(canvasSync)
    .innerJoin(users, eq(users.id, canvasSync.studentId))
    .innerJoin(projects, eq(projects.id, canvasSync.projectId))
    .where(
      and(
        or(eq(canvasSync.status, "pending"), eq(canvasSync.status, "failed")),
        lt(canvasSync.attempts, MAX_ATTEMPTS),
      ),
    )
    .orderBy(asc(canvasSync.queuedAt))
    .limit(limit);

  report.considered = due.length;

  for (const row of due) {
    // A project with no Canvas assignment mapped is not an error -- it just
    // is not synced. Marked skipped so it is visible rather than looking stuck.
    if (row.assignmentId === null) {
      await db
        .update(canvasSync)
        .set({ status: "skipped", lastError: "No Canvas assignment mapped for this project." })
        .where(eq(canvasSync.id, row.id));
      report.skipped++;
      continue;
    }

    const result = await pushGrade({
      assignmentId: row.assignmentId,
      ucinetid: row.ucinetid,
      score: row.score,
      comment: row.comment,
    });

    if (result.ok) {
      await db
        .update(canvasSync)
        .set({
          status: "synced",
          syncedAt: new Date(),
          attempts: row.attempts + 1,
          lastError: null,
        })
        .where(eq(canvasSync.id, row.id));
      report.pushed++;
    } else {
      await db
        .update(canvasSync)
        .set({
          // A non-retryable failure is parked immediately at the attempt
          // ceiling rather than retried four more times to no purpose.
          status: "failed",
          attempts: result.retryable ? row.attempts + 1 : MAX_ATTEMPTS,
          lastError: result.error,
        })
        .where(eq(canvasSync.id, row.id));
      report.failed++;
      report.errors.push(`${row.ucinetid} / ${row.projectLabel}: ${result.error}`);
    }
  }

  return report;
}

/** Counts for the admin screen. */
export async function canvasSyncSummary() {
  const rows = await getDb()
    .select({ status: canvasSync.status, attempts: canvasSync.attempts })
    .from(canvasSync);

  return {
    total: rows.length,
    pending: rows.filter((r) => r.status === "pending").length,
    synced: rows.filter((r) => r.status === "synced").length,
    failed: rows.filter((r) => r.status === "failed").length,
    skipped: rows.filter((r) => r.status === "skipped").length,
    exhausted: rows.filter((r) => r.status === "failed" && r.attempts >= MAX_ATTEMPTS).length,
  };
}

/** Recent failures, for showing an admin what went wrong. */
export async function canvasSyncFailures(limit = 20) {
  return getDb()
    .select({
      ucinetid: users.ucinetid,
      projectLabel: projects.label,
      score: canvasSync.score,
      pointsPossible: canvasSync.pointsPossible,
      attempts: canvasSync.attempts,
      lastError: canvasSync.lastError,
      status: canvasSync.status,
    })
    .from(canvasSync)
    .innerJoin(users, eq(users.id, canvasSync.studentId))
    .innerJoin(projects, eq(projects.id, canvasSync.projectId))
    .where(
      and(
        inArray(canvasSync.status, ["failed", "skipped"]),
        isNotNull(canvasSync.lastError),
      ),
    )
    .orderBy(asc(canvasSync.queuedAt))
    .limit(limit);
}
