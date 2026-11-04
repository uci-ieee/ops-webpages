"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/session";
import {
  CURRENT_YEAR,
  applyRoster,
  parseRoster,
  pruneEmptySections,
  removeDemoRoster,
  type ApplyResult,
} from "@/lib/roster";

export type ImportState =
  | { status: "idle" }
  | { status: "error"; errors: string[] }
  | { status: "done"; result: ApplyResult; year: string }
  | { status: "cleared"; deleted: number; sectionsRemoved: number };

export async function importRoster(
  _prev: ImportState | null,
  formData: FormData,
): Promise<ImportState> {
  // Every server action re-checks the role. The page guard is not enough: an
  // action is a POST endpoint that anyone can call directly.
  await requireRole("admin");

  const text = String(formData.get("roster") ?? "");
  const year = String(formData.get("year") ?? "").trim() || CURRENT_YEAR;

  const { rows, errors } = parseRoster(text);

  // All-or-nothing: a half-imported roster is worse than a rejected one.
  if (errors.length > 0) return { status: "error", errors };
  if (rows.length === 0) return { status: "error", errors: ["No rows found below the header."] };

  const result = await applyRoster(rows, year);

  revalidatePath("/admin");
  revalidatePath("/admin/roster");
  revalidatePath("/instructor");

  return { status: "done", result, year };
}

export async function clearDemoRoster(): Promise<ImportState> {
  await requireRole("admin");

  const { deleted } = await removeDemoRoster();
  const sectionsRemoved = await pruneEmptySections();

  revalidatePath("/admin");
  revalidatePath("/admin/roster");
  revalidatePath("/instructor");

  return { status: "cleared", deleted: deleted.length, sectionsRemoved };
}
