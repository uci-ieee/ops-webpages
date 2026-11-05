"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { enrollments, sectionInstructors, users } from "@/lib/db/schema";
import type { Role } from "@/lib/db/schema";
import { requireActorRole } from "@/lib/preview";

export type PeopleResult = { ok: true; message: string } | { ok: false; error: string };

const ROLES: Role[] = ["student", "instructor", "admin"];

function refresh(userId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/people");
  revalidatePath("/admin/sections");
  revalidatePath("/instructor");
  revalidatePath("/");
  if (userId) revalidatePath(`/instructor/student/${userId}`);
}

/**
 * Change someone's role.
 *
 * Also tidies up memberships that no longer make sense, so the data cannot end
 * up describing a student who teaches a section.
 */
export async function setPersonRole(formData: FormData): Promise<PeopleResult> {
  const actor = await requireActorRole("admin");

  const userId = String(formData.get("userId") ?? "");
  const role = String(formData.get("role") ?? "") as Role;
  if (!userId || !ROLES.includes(role)) return { ok: false, error: "Pick a valid role." };

  const db = getDb();
  const rows = await db
    .select({ id: users.id, ucinetid: users.ucinetid, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const person = rows[0];
  if (!person) return { ok: false, error: "That person is not on the roster." };
  if (person.role === role) return { ok: true, message: `${person.ucinetid} is already ${role}.` };

  /**
   * Refuse to remove the last admin who has actually signed in. Without this,
   * one careless change locks everyone out of /admin permanently, and there is
   * no UI left to undo it with.
   */
  if (person.role === "admin" && role !== "admin") {
    const otherActiveAdmins = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.status, "active"), ne(users.id, person.id)));

    if (otherActiveAdmins.length === 0) {
      return {
        ok: false,
        error:
          `${person.ucinetid} is the only admin who has signed in. Promote someone else to admin ` +
          `first, and have them sign in, or nobody will be able to reach this page.`,
      };
    }
  }

  await db.update(users).set({ role }).where(eq(users.id, person.id));

  if (role === "student") {
    // A student does not run sections.
    await db.delete(sectionInstructors).where(eq(sectionInstructors.instructorId, person.id));
  } else {
    // Instructors and admins are not enrolled as students.
    await db.delete(enrollments).where(eq(enrollments.studentId, person.id));
  }

  refresh(person.id);
  return {
    ok: true,
    message: `${person.ucinetid}: ${person.role} → ${role}${
      person.id === actor.id && role !== "admin" ? " (you have just changed your own role)" : ""
    }`,
  };
}

/** Move one person into a section, or out of every section. */
export async function setPersonSection(formData: FormData): Promise<PeopleResult> {
  await requireActorRole("admin");

  const userId = String(formData.get("userId") ?? "");
  const raw = String(formData.get("sectionId") ?? "");
  if (!userId) return { ok: false, error: "No person selected." };

  const db = getDb();
  const rows = await db
    .select({ id: users.id, ucinetid: users.ucinetid, role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const person = rows[0];
  if (!person) return { ok: false, error: "That person is not on the roster." };

  const isStudent = person.role === "student";

  // Clear existing placement, then apply the new one.
  if (isStudent) {
    await db.delete(enrollments).where(eq(enrollments.studentId, person.id));
  } else {
    await db.delete(sectionInstructors).where(eq(sectionInstructors.instructorId, person.id));
  }

  if (raw !== "none") {
    const sectionId = Number(raw);
    if (Number.isFinite(sectionId)) {
      if (isStudent) {
        await db
          .insert(enrollments)
          .values({ sectionId, studentId: person.id })
          .onConflictDoNothing();
      } else {
        await db
          .insert(sectionInstructors)
          .values({ sectionId, instructorId: person.id })
          .onConflictDoNothing();
      }
    }
  }

  refresh(person.id);
  return {
    ok: true,
    message:
      raw === "none"
        ? `${person.ucinetid} removed from all sections.`
        : `${person.ucinetid} assigned.`,
  };
}
