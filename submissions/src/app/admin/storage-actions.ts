"use server";

import { revalidatePath } from "next/cache";
import { requireActorRole } from "@/lib/preview";
import { runPurge } from "@/lib/purge";

/**
 * Manual trigger for the retention sweep, for when an admin needs space back
 * now rather than at the next scheduled run.
 */
export async function runPurgeNow() {
  await requireActorRole("admin");
  const report = await runPurge({ dryRun: false });
  console.log("[purge:manual]", JSON.stringify(report));
  revalidatePath("/admin");
  revalidatePath("/");
}
