import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { getDb } from "./db";
import { deliverables, projects, reviews, submissions, users } from "./db/schema";
import type { DeliverableKind } from "./db/schema";
import { CURRENT_YEAR } from "./roster";

/**
 * How long files live. Rows are permanent; these govern the stored object only.
 *
 * NOTE on supersededDays: the original requirement was that an instructor can
 * still get at a previous submission but has to download it rather than stream
 * it. That is incompatible with deleting superseded files the instant a student
 * resubmits, so superseded files are kept for a week -- long enough to be
 * fetched, short enough that resubmissions do not accumulate all year.
 */
export const RETENTION = {
  supersededDays: 7,
  afterReviewDays: 30,
  /** Backstop so an ungraded submission does not live forever. */
  backstopDays: 120,
};

export function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

export type ReviewView = {
  status: "approved" | "needs_work";
  score: number | null;
  comment: string | null;
  reviewedAt: Date;
  reviewer: string | null;
};

export type SubmissionView = {
  id: string;
  version: number;
  filename: string;
  bytes: number;
  contentType: string;
  durationSeconds: number | null;
  submittedAt: Date;
  supersededAt: Date | null;
  fileDeletedAt: Date | null;
  storageKey: string;
  review: ReviewView | null;
};

export type DeliverableView = {
  id: number;
  position: number;
  kind: DeliverableKind;
  label: string;
  instructions: string | null;
  maxBytes: number;
  maxSeconds: number | null;
  allowedExtensions: string[];
  pointsPossible: number;
  latest: SubmissionView | null;
  /** Superseded versions, newest first. Download-only by design. */
  history: SubmissionView[];
};

export type ProjectView = {
  id: number;
  slug: string;
  label: string;
  title: string;
  pageUrl: string | null;
  published: boolean;
  deliverables: DeliverableView[];
};

/**
 * Everything a student owes and everything they have handed in, for every
 * project. Two queries regardless of roster size -- the whole definition set is
 * 25 rows, so it is fetched whole and stitched in memory rather than per
 * project.
 */
export async function getProgressFor(
  studentId: string,
  opts: { year?: string; publishedOnly?: boolean } = {},
): Promise<ProjectView[]> {
  const year = opts.year ?? CURRENT_YEAR;
  const publishedOnly = opts.publishedOnly ?? false;
  const db = getDb();

  const [definition, handedIn] = await Promise.all([
    db
      .select({
        projectId: projects.id,
        slug: projects.slug,
        label: projects.label,
        title: projects.title,
        pageUrl: projects.pageUrl,
        published: projects.published,
        projectPosition: projects.position,
        deliverableId: deliverables.id,
        position: deliverables.position,
        kind: deliverables.kind,
        dLabel: deliverables.label,
        instructions: deliverables.instructions,
        maxBytes: deliverables.maxBytes,
        maxSeconds: deliverables.maxSeconds,
        allowedExtensions: deliverables.allowedExtensions,
        pointsPossible: deliverables.pointsPossible,
      })
      .from(projects)
      .innerJoin(deliverables, eq(deliverables.projectId, projects.id))
      .where(
        publishedOnly
          ? and(eq(projects.year, year), eq(projects.published, true))
          : eq(projects.year, year),
      )
      .orderBy(asc(projects.position), asc(deliverables.position)),

    db
      .select({
        id: submissions.id,
        deliverableId: submissions.deliverableId,
        version: submissions.version,
        filename: submissions.filename,
        bytes: submissions.bytes,
        contentType: submissions.contentType,
        durationSeconds: submissions.durationSeconds,
        submittedAt: submissions.submittedAt,
        supersededAt: submissions.supersededAt,
        fileDeletedAt: submissions.fileDeletedAt,
        storageKey: submissions.storageKey,
        reviewStatus: reviews.status,
        reviewScore: reviews.score,
        reviewComment: reviews.comment,
        reviewedAt: reviews.reviewedAt,
        reviewerName: users.name,
        reviewerUcinetid: users.ucinetid,
      })
      .from(submissions)
      .leftJoin(reviews, eq(reviews.submissionId, submissions.id))
      .leftJoin(users, eq(users.id, reviews.reviewerId))
      .where(eq(submissions.studentId, studentId))
      .orderBy(desc(submissions.version)),
  ]);

  const byDeliverable = new Map<number, SubmissionView[]>();
  for (const row of handedIn) {
    const view: SubmissionView = {
      id: row.id,
      version: row.version,
      filename: row.filename,
      bytes: row.bytes,
      contentType: row.contentType,
      durationSeconds: row.durationSeconds,
      submittedAt: row.submittedAt,
      supersededAt: row.supersededAt,
      fileDeletedAt: row.fileDeletedAt,
      storageKey: row.storageKey,
      review: row.reviewStatus
        ? {
            status: row.reviewStatus,
            score: row.reviewScore,
            comment: row.reviewComment,
            reviewedAt: row.reviewedAt!,
            reviewer: row.reviewerName ?? row.reviewerUcinetid ?? null,
          }
        : null,
    };
    const list = byDeliverable.get(row.deliverableId) ?? [];
    list.push(view);
    byDeliverable.set(row.deliverableId, list);
  }

  const out: ProjectView[] = [];
  for (const row of definition) {
    let project = out.find((p) => p.id === row.projectId);
    if (!project) {
      project = {
        id: row.projectId,
        slug: row.slug,
        label: row.label,
        title: row.title,
        pageUrl: row.pageUrl,
        published: row.published,
        deliverables: [],
      };
      out.push(project);
    }

    const all = byDeliverable.get(row.deliverableId) ?? [];
    const latest = all.find((s) => s.supersededAt === null) ?? null;
    const history = all.filter((s) => s.supersededAt !== null);

    project.deliverables.push({
      id: row.deliverableId,
      position: row.position,
      kind: row.kind,
      label: row.dLabel,
      instructions: row.instructions,
      maxBytes: row.maxBytes,
      maxSeconds: row.maxSeconds,
      allowedExtensions: row.allowedExtensions,
      pointsPossible: row.pointsPossible,
      latest,
      history,
    });
  }

  return out;
}

export type ProgressTally = { required: number; submitted: number; needsWork: number };

export function tally(projectsView: ProjectView[]): ProgressTally {
  let required = 0;
  let submitted = 0;
  let needsWork = 0;
  for (const p of projectsView) {
    for (const d of p.deliverables) {
      required++;
      if (d.latest) submitted++;
      if (d.latest?.review?.status === "needs_work") needsWork++;
    }
  }
  return { required, submitted, needsWork };
}

/**
 * Current-submission counts for a set of students, in one query. Used for the
 * instructor roster so the list does not fan out into a query per student.
 */
export async function submissionCountsByStudent(
  studentIds: string[],
): Promise<Map<string, { submitted: number; needsWork: number; awaiting: number }>> {
  const out = new Map<string, { submitted: number; needsWork: number; awaiting: number }>();
  if (studentIds.length === 0) return out;

  const rows = await getDb()
    .select({
      studentId: submissions.studentId,
      status: reviews.status,
    })
    .from(submissions)
    .leftJoin(reviews, eq(reviews.submissionId, submissions.id))
    .where(
      and(inArray(submissions.studentId, studentIds), isNull(submissions.supersededAt)),
    );

  for (const row of rows) {
    const cur = out.get(row.studentId) ?? { submitted: 0, needsWork: 0, awaiting: 0 };
    cur.submitted++;
    if (row.status === "needs_work") cur.needsWork++;
    if (row.status === null) cur.awaiting++;
    out.set(row.studentId, cur);
  }
  return out;
}

/** Total deliverables defined for a year -- the denominator on progress. */
export async function deliverableCount(
  year: string = CURRENT_YEAR,
  publishedOnly = true,
): Promise<number> {
  const rows = await getDb()
    .select({ id: deliverables.id })
    .from(deliverables)
    .innerJoin(projects, eq(projects.id, deliverables.projectId))
    .where(
      publishedOnly
        ? and(eq(projects.year, year), eq(projects.published, true))
        : eq(projects.year, year),
    );
  return rows.length;
}

/** One deliverable with its project, for validating an upload request. */
export async function getDeliverable(deliverableId: number) {
  const rows = await getDb()
    .select({
      id: deliverables.id,
      kind: deliverables.kind,
      label: deliverables.label,
      maxBytes: deliverables.maxBytes,
      maxSeconds: deliverables.maxSeconds,
      allowedExtensions: deliverables.allowedExtensions,
      pointsPossible: deliverables.pointsPossible,
      projectSlug: projects.slug,
      year: projects.year,
      projectLabel: projects.label,
      published: projects.published,
    })
    .from(deliverables)
    .innerJoin(projects, eq(projects.id, deliverables.projectId))
    .where(eq(deliverables.id, deliverableId))
    .limit(1);
  return rows[0] ?? null;
}

export async function nextVersion(deliverableId: number, studentId: string): Promise<number> {
  const rows = await getDb()
    .select({ version: submissions.version })
    .from(submissions)
    .where(
      and(eq(submissions.deliverableId, deliverableId), eq(submissions.studentId, studentId)),
    )
    .orderBy(desc(submissions.version))
    .limit(1);
  return (rows[0]?.version ?? 0) + 1;
}
