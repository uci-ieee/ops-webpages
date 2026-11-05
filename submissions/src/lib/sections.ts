import { asc, eq } from "drizzle-orm";
import { getDb } from "./db";
import { enrollments, sectionInstructors, sections } from "./db/schema";

/**
 * Read helpers for the admin section screens.
 *
 * Deliberately NOT in the "use server" actions file: everything exported from
 * one of those becomes a callable endpoint, and these read membership. They are
 * imported by server components instead, which already enforce the admin role.
 */

export async function listSections(year?: string) {
  const db = getDb();
  const rows = year
    ? await db
        .select()
        .from(sections)
        .where(eq(sections.year, year))
        .orderBy(asc(sections.year), asc(sections.code))
    : await db.select().from(sections).orderBy(asc(sections.year), asc(sections.code));
  return rows;
}

export async function getSection(sectionId: number) {
  const rows = await getDb()
    .select()
    .from(sections)
    .where(eq(sections.id, sectionId))
    .limit(1);
  return rows[0] ?? null;
}

export async function currentMembership(sectionId: number) {
  const db = getDb();
  const [students, instructors] = await Promise.all([
    db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(eq(enrollments.sectionId, sectionId)),
    db
      .select({ id: sectionInstructors.instructorId })
      .from(sectionInstructors)
      .where(eq(sectionInstructors.sectionId, sectionId)),
  ]);
  return {
    students: new Set(students.map((s) => s.id)),
    instructors: new Set(instructors.map((i) => i.id)),
  };
}

/** Which section each student currently sits in. */
export async function studentSectionMap(): Promise<Map<string, { id: number; code: string }>> {
  const rows = await getDb()
    .select({ studentId: enrollments.studentId, sectionId: sections.id, code: sections.code })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId));

  const out = new Map<string, { id: number; code: string }>();
  for (const r of rows) out.set(r.studentId, { id: r.sectionId, code: r.code });
  return out;
}

/** Which sections each instructor runs. */
export async function instructorSectionMap(): Promise<Map<string, string[]>> {
  const rows = await getDb()
    .select({ instructorId: sectionInstructors.instructorId, code: sections.code })
    .from(sectionInstructors)
    .innerJoin(sections, eq(sections.id, sectionInstructors.sectionId));

  const out = new Map<string, string[]>();
  for (const r of rows) {
    const list = out.get(r.instructorId) ?? [];
    list.push(r.code);
    out.set(r.instructorId, list);
  }
  return out;
}
