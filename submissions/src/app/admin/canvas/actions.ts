"use server";

import { revalidatePath } from "next/cache";
import { requireActorRole } from "@/lib/preview";
import { drainCanvasSync } from "@/lib/canvas-sync";

/** Push everything outstanding now, rather than waiting for the daily sweep. */
export async function syncCanvasNow() {
  await requireActorRole("admin");
  const report = await drainCanvasSync(200);
  console.log("[canvas-sync:manual]", JSON.stringify(report));
  revalidatePath("/admin/canvas");
  revalidatePath("/admin");
}
