"use server";

import { DEV_LOGIN_ENABLED, signIn, signOut } from "@/lib/auth";

export async function signInWithGoogle() {
  await signIn("google", { redirectTo: "/" });
}

export async function signOutEverywhere() {
  await signOut({ redirectTo: "/login" });
}

/** Dev-only. The provider does not exist in a production build. */
export async function devSignIn(formData: FormData) {
  if (!DEV_LOGIN_ENABLED) return;
  const ucinetid = String(formData.get("ucinetid") ?? "").trim();
  if (!ucinetid) return;
  await signIn("dev-login", { ucinetid, redirectTo: "/" });
}
