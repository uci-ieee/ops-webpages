import { and, asc, count, eq } from "drizzle-orm";
import { getDb } from "./db";
import { enrollments, sectionInstructors, sections, users } from "./db/schema";

/** Sections this instructor runs. */
export async function sectionsForInstructor(instructorId: string) {
  return getDb()
    .select({
      id: sections.id,
      code: sections.code,
      name: sections.name,
      year: sections.year,
    })
    .from(sectionInstructors)
    .innerJoin(sections, eq(sections.id, sectionInstructors.sectionId))
    .where(eq(sectionInstructors.instructorId, instructorId))
    .orderBy(asc(sections.code));
}

/**
 * Every student this instructor is allowed to see, and nobody else. One join,
 * no per-section follow-up queries -- the scoping lives in the WHERE clause so
 * there is no code path that returns an unscoped list by accident.
 */
export async function studentsForInstructor(instructorId: string) {
  return getDb()
    .select({
      id: users.id,
      ucinetid: users.ucinetid,
      name: users.name,
      email: users.email,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
      sectionId: sections.id,
      sectionCode: sections.code,
      sectionName: sections.name,
    })
    .from(sectionInstructors)
    .innerJoin(sections, eq(sections.id, sectionInstructors.sectionId))
    .innerJoin(enrollments, eq(enrollments.sectionId, sections.id))
    .innerJoin(users, eq(users.id, enrollments.studentId))
    .where(eq(sectionInstructors.instructorId, instructorId))
    .orderBy(asc(sections.code), asc(users.ucinetid));
}

/**
 * The authorization primitive for any per-student page an instructor opens.
 * Hiding a row in a list is not access control; this is what makes a guessed
 * URL fail.
 */
export async function instructorCanSeeStudent(
  instructorId: string,
  studentId: string,
): Promise<boolean> {
  const rows = await getDb()
    .select({ sectionId: sections.id })
    .from(sectionInstructors)
    .innerJoin(sections, eq(sections.id, sectionInstructors.sectionId))
    .innerJoin(enrollments, eq(enrollments.sectionId, sections.id))
    .where(
      and(
        eq(sectionInstructors.instructorId, instructorId),
        eq(enrollments.studentId, studentId),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/** The sections a student is enrolled in, with who teaches them. */
export async function sectionsForStudent(studentId: string) {
  const rows = await getDb()
    .select({
      id: sections.id,
      code: sections.code,
      name: sections.name,
      year: sections.year,
      instructorName: users.name,
      instructorUcinetid: users.ucinetid,
    })
    .from(enrollments)
    .innerJoin(sections, eq(sections.id, enrollments.sectionId))
    .leftJoin(sectionInstructors, eq(sectionInstructors.sectionId, sections.id))
    .leftJoin(users, eq(users.id, sectionInstructors.instructorId))
    .where(eq(enrollments.studentId, studentId))
    .orderBy(asc(sections.code));

  // Collapse the instructor fan-out into one row per section.
  const bySection = new Map<
    number,
    { id: number; code: string; name: string; year: string; instructors: string[] }
  >();
  for (const row of rows) {
    const existing = bySection.get(row.id);
    const label = row.instructorName ?? row.instructorUcinetid;
    if (existing) {
      if (label) existing.instructors.push(label);
    } else {
      bySection.set(row.id, {
        id: row.id,
        code: row.code,
        name: row.name,
        year: row.year,
        instructors: label ? [label] : [],
      });
    }
  }
  return [...bySection.values()];
}

/**
 * Admin landing data. Three small queries in parallel, stitched in memory --
 * cheaper and far easier to read than one correlated-subquery monster, and at
 * 12 sections the difference is unmeasurable.
 */
export async function adminOverview() {
  const db = getDb();

  const [sectionRows, instructorRows, countRows, roleCounts] = await Promise.all([
    db
      .select({ id: sections.id, code: sections.code, name: sections.name, year: sections.year })
      .from(sections)
      .orderBy(asc(sections.year), asc(sections.code)),
    db
      .select({
        sectionId: sectionInstructors.sectionId,
        name: users.name,
        ucinetid: users.ucinetid,
      })
      .from(sectionInstructors)
      .innerJoin(users, eq(users.id, sectionInstructors.instructorId)),
    db
      .select({ sectionId: enrollments.sectionId, students: count() })
      .from(enrollments)
      .groupBy(enrollments.sectionId),
    db.select({ role: users.role, total: count() }).from(users).groupBy(users.role),
  ]);

  const instructorsBySection = new Map<number, string[]>();
  for (const row of instructorRows) {
    const list = instructorsBySection.get(row.sectionId) ?? [];
    list.push(row.name ?? row.ucinetid);
    instructorsBySection.set(row.sectionId, list);
  }

  const studentsBySection = new Map(countRows.map((r) => [r.sectionId, Number(r.students)]));

  return {
    sections: sectionRows.map((s) => ({
      ...s,
      instructors: instructorsBySection.get(s.id) ?? [],
      students: studentsBySection.get(s.id) ?? 0,
    })),
    totals: Object.fromEntries(roleCounts.map((r) => [r.role, Number(r.total)])) as Record<
      string,
      number | undefined
    >,
  };
}

/** Full user list for the admin roster screen. */
export async function allUsers() {
  return getDb()
    .select({
      id: users.id,
      ucinetid: users.ucinetid,
      name: users.name,
      email: users.email,
      role: users.role,
      status: users.status,
      lastLoginAt: users.lastLoginAt,
    })
    .from(users)
    .orderBy(asc(users.role), asc(users.ucinetid));
}
