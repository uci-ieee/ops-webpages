"use server";

import { redirect } from "next/navigation";
import { clearPreviewTarget, requireActorRole, setPreviewTarget } from "@/lib/preview";
import { homeFor } from "@/lib/session";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Start previewing someone. Only an admin can do this, and requireActorRole
 * also refuses while a preview is already active, so previews cannot be
 * chained to obscure who is really signed in.
 */
export async function startPreview(formData: FormData) {
  await requireActorRole("admin");

  const ucinetid = String(formData.get("ucinetid") ?? "").trim().toLowerCase();
  if (!ucinetid) return;

  const rows = await getDb()
    .select({ role: users.role })
    .from(users)
    .where(eq(users.ucinetid, ucinetid))
    .limit(1);

  const target = rows[0];
  if (!target) return;

  await setPreviewTarget(ucinetid);
  redirect(homeFor(target.role));
}

export async function stopPreview() {
  // No role check: anyone should be able to get out of a preview, and clearing
  // the cookie can only ever reduce what they see.
  await clearPreviewTarget();
  redirect("/admin/view-as");
}
