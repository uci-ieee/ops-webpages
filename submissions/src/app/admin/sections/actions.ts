"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { enrollments, sectionInstructors, sections } from "@/lib/db/schema";
import { requireActorRole } from "@/lib/preview";
import { CURRENT_YEAR } from "@/lib/roster";

export async function createSection(formData: FormData) {
  await requireActorRole("admin");

  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim() || `Section ${code}`;
  const year = String(formData.get("year") ?? "").trim() || CURRENT_YEAR;
  if (!code) return;

  const [row] = await getDb()
    .insert(sections)
    .values({ code, name, year })
    .onConflictDoUpdate({ target: [sections.code, sections.year], set: { name } })
    .returning({ id: sections.id });

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  redirect(`/admin/sections/${row!.id}`);
}

/**
 * Replace a section's membership wholesale.
 *
 * Replace rather than add: the roster import can only ever add, which means a
 * mistaken assignment could not be undone without editing the database by
 * hand. Unchecking someone here actually removes them.
 */
export async function setSectionMembers(formData: FormData) {
  await requireActorRole("admin");

  const sectionId = Number(formData.get("sectionId"));
  if (!Number.isFinite(sectionId)) return;

  const studentIds = formData.getAll("students").map(String).filter(Boolean);
  const instructorIds = formData.getAll("instructors").map(String).filter(Boolean);

  const db = getDb();

  // Students
  await db.delete(enrollments).where(eq(enrollments.sectionId, sectionId));
  if (studentIds.length > 0) {
    await db
      .insert(enrollments)
      .values(studentIds.map((studentId) => ({ sectionId, studentId })))
      .onConflictDoNothing();
  }

  // Instructors. Admins are allowed here too: an admin assigned to a section
  // sees it on the instructor screen, which is how an officer who also runs a
  // lab gets their own roster.
  await db.delete(sectionInstructors).where(eq(sectionInstructors.sectionId, sectionId));
  if (instructorIds.length > 0) {
    await db
      .insert(sectionInstructors)
      .values(instructorIds.map((instructorId) => ({ sectionId, instructorId })))
      .onConflictDoNothing();
  }

  revalidatePath("/admin/sections");
  revalidatePath(`/admin/sections/${sectionId}`);
  revalidatePath("/admin");
  revalidatePath("/instructor");
}

/** Move one student between sections without touching anyone else. */
export async function moveStudent(formData: FormData) {
  await requireActorRole("admin");

  const studentId = String(formData.get("studentId") ?? "");
  const rawTarget = String(formData.get("sectionId") ?? "");
  if (!studentId) return;

  const db = getDb();
  await db.delete(enrollments).where(eq(enrollments.studentId, studentId));

  if (rawTarget !== "none") {
    const sectionId = Number(rawTarget);
    if (Number.isFinite(sectionId)) {
      await db.insert(enrollments).values({ sectionId, studentId }).onConflictDoNothing();
    }
  }

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  revalidatePath("/instructor");
}

export async function deleteSection(formData: FormData) {
  await requireActorRole("admin");

  const sectionId = Number(formData.get("sectionId"));
  if (!Number.isFinite(sectionId)) return;

  const db = getDb();

  // Refuse while anyone is still in it, rather than silently cascading away
  // enrollments that someone may still need.
  const students = await db
    .select({ id: enrollments.studentId })
    .from(enrollments)
    .where(eq(enrollments.sectionId, sectionId))
    .limit(1);
  if (students.length > 0) return;

  await db.delete(sectionInstructors).where(eq(sectionInstructors.sectionId, sectionId));
  await db.delete(sections).where(eq(sections.id, sectionId));

  revalidatePath("/admin/sections");
  revalidatePath("/admin");
  redirect("/admin/sections");
}

export async function removeInstructorFromAll(formData: FormData) {
  await requireActorRole("admin");
  const instructorId = String(formData.get("instructorId") ?? "");
  if (!instructorId) return;
  await getDb().delete(sectionInstructors).where(eq(sectionInstructors.instructorId, instructorId));
  revalidatePath("/admin/sections");
  revalidatePath("/instructor");
}

export async function assignInstructor(formData: FormData) {
  await requireActorRole("admin");
  const instructorId = String(formData.get("instructorId") ?? "");
  const sectionId = Number(formData.get("sectionId"));
  if (!instructorId || !Number.isFinite(sectionId)) return;

  await getDb()
    .insert(sectionInstructors)
    .values({ sectionId, instructorId })
    .onConflictDoNothing();

  revalidatePath("/admin/sections");
  revalidatePath("/instructor");
}

export async function unassignInstructor(formData: FormData) {
  await requireActorRole("admin");
  const instructorId = String(formData.get("instructorId") ?? "");
  const sectionId = Number(formData.get("sectionId"));
  if (!instructorId || !Number.isFinite(sectionId)) return;

  await getDb()
    .delete(sectionInstructors)
    .where(
      and(
        eq(sectionInstructors.instructorId, instructorId),
        eq(sectionInstructors.sectionId, sectionId),
      ),
    );

  revalidatePath("/admin/sections");
  revalidatePath("/instructor");
}

/** Bulk helper: put every listed student into one section. */
export async function addStudentsToSection(sectionId: number, studentIds: string[]) {
  await requireActorRole("admin");
  if (studentIds.length === 0) return;
  const db = getDb();
  await db.delete(enrollments).where(inArray(enrollments.studentId, studentIds));
  await db
    .insert(enrollments)
    .values(studentIds.map((studentId) => ({ sectionId, studentId })))
    .onConflictDoNothing();
  revalidatePath("/admin/sections");
  revalidatePath("/instructor");
}
