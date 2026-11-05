import { asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { deliverables, projects, submissions } from "./db/schema";
import { CURRENT_YEAR } from "./roster";

/**
 * Read helpers for the admin projects screen. Kept out of the "use server"
 * actions file, since everything exported from one of those becomes a callable
 * endpoint.
 */

export type ProjectAdminRow = {
  id: number;
  slug: string;
  label: string;
  title: string;
  pageUrl: string | null;
  position: number;
  published: boolean;
  deliverableCount: number;
  submissionCount: number;
};

export async function listProjectsForAdmin(
  year: string = CURRENT_YEAR,
): Promise<ProjectAdminRow[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(projects)
    .where(eq(projects.year, year))
    .orderBy(asc(projects.position));

  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  const [delCounts, subCounts] = await Promise.all([
    db
      .select({ projectId: deliverables.projectId, n: sql<string>`count(*)` })
      .from(deliverables)
      .where(inArray(deliverables.projectId, ids))
      .groupBy(deliverables.projectId),
    db
      .select({ projectId: deliverables.projectId, n: sql<string>`count(*)` })
      .from(submissions)
      .innerJoin(deliverables, eq(deliverables.id, submissions.deliverableId))
      .where(isNull(submissions.supersededAt))
      .groupBy(deliverables.projectId),
  ]);

  const byDel = new Map(delCounts.map((c) => [c.projectId, Number(c.n)]));
  const bySub = new Map(subCounts.map((c) => [c.projectId, Number(c.n)]));

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    label: r.label,
    title: r.title,
    pageUrl: r.pageUrl,
    position: r.position,
    published: r.published,
    deliverableCount: byDel.get(r.id) ?? 0,
    submissionCount: bySub.get(r.id) ?? 0,
  }));
}
