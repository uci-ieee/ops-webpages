"use server";

import { revalidatePath } from "next/cache";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { requireActorRole } from "@/lib/preview";
import { CURRENT_YEAR } from "@/lib/roster";

function refresh() {
  revalidatePath("/");
  revalidatePath("/admin");
  revalidatePath("/admin/projects");
  revalidatePath("/instructor");
}

/** Show or hide one project for students. */
export async function setProjectPublished(formData: FormData) {
  await requireActorRole("admin");

  const projectId = Number(formData.get("projectId"));
  const published = String(formData.get("published")) === "1";
  if (!Number.isFinite(projectId)) return;

  await getDb().update(projects).set({ published }).where(eq(projects.id, projectId));
  refresh();
}

/**
 * Publish everything up to and including a position, hiding the rest. The
 * common case by far: the program runs in order, so "students can see through
 * Project 3" is one action rather than ten toggles.
 */
export async function publishThrough(formData: FormData) {
  await requireActorRole("admin");

  const through = Number(formData.get("through"));
  const year = String(formData.get("year") ?? "") || CURRENT_YEAR;
  if (!Number.isFinite(through)) return;

  const db = getDb();
  // Hide everything for the year, then reveal up to the chosen position.
  await db.update(projects).set({ published: false }).where(eq(projects.year, year));
  if (through > 0) {
    await db
      .update(projects)
      .set({ published: true })
      .where(and(eq(projects.year, year), lte(projects.position, through)));
  }
  refresh();
}

/**
 * Map a project to its Canvas assignment. Blank clears the mapping, which
 * leaves the project un-synced rather than failing.
 */
export async function setCanvasAssignment(formData: FormData) {
  await requireActorRole("admin");

  const projectId = Number(formData.get("projectId"));
  const raw = String(formData.get("canvasAssignmentId") ?? "").trim();
  if (!Number.isFinite(projectId)) return;

  const parsed = raw === "" ? null : Number(raw);
  if (parsed !== null && (!Number.isInteger(parsed) || parsed <= 0)) return;

  await getDb()
    .update(projects)
    .set({ canvasAssignmentId: parsed })
    .where(eq(projects.id, projectId));

  revalidatePath("/admin/projects");
  revalidatePath("/admin/canvas");
}
