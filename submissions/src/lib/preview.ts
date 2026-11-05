import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "./db/schema";
import type { Role, User } from "./db/schema";
import { currentUser } from "./session";

const COOKIE = "ops_preview_as";

/**
 * Admin "View as". Lets an admin see exactly what a given student or instructor
 * sees, which is otherwise impossible in production -- the dev role switcher is
 * compiled out of production builds.
 *
 * This is NOT an impersonation backdoor, and the distinction is structural:
 *
 *  - The cookie only names a UCInetID. It grants nothing by itself.
 *  - It is honoured only when the *real* session belongs to an admin, checked
 *    against the database on every request. A non-admin who forges the cookie
 *    gets their own view, because the admin check fails before the cookie is
 *    read.
 *  - It is read-only. Every mutating action calls requireActor(), which refuses
 *    while a preview is active, so an admin cannot submit work or grade as
 *    someone else.
 */
export type ViewContext = {
  /** The signed-in human. */
  actor: User;
  /** Whose data to render -- the same as actor unless previewing. */
  subject: User;
  previewing: boolean;
};

export async function getPreviewTarget(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

/**
 * Resolve who we are and whose data to show. Returns null when nobody is
 * signed in, so callers can redirect.
 */
export async function getViewContext(): Promise<ViewContext | null> {
  const actor = await currentUser();
  if (!actor) return null;

  // Only an admin's preview cookie means anything.
  if (actor.role !== "admin") return { actor, subject: actor, previewing: false };

  const target = await getPreviewTarget();
  if (!target || target === actor.ucinetid) {
    return { actor, subject: actor, previewing: false };
  }

  const rows = await getDb().select().from(users).where(eq(users.ucinetid, target)).limit(1);
  const subject = rows[0];
  if (!subject) return { actor, subject: actor, previewing: false };

  return { actor, subject, previewing: true };
}

export async function setPreviewTarget(ucinetid: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, ucinetid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    // Short-lived on purpose: a forgotten preview is confusing, and this should
    // never be a persistent mode.
    maxAge: 60 * 60,
  });
}

export async function clearPreviewTarget(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

/** Page guard: resolve the view context or send them to sign in. */
export async function requireViewContext(): Promise<ViewContext> {
  const ctx = await getViewContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/**
 * Guard for anything that writes. Returns the real signed-in user and refuses
 * outright while a preview is active -- an admin looking at a student's page
 * must not be able to submit work as them, or grade as an instructor.
 */
export async function requireActor(): Promise<User> {
  const ctx = await getViewContext();
  if (!ctx) redirect("/login");
  if (ctx.previewing) {
    throw new Error(
      "This is a read-only preview. Stop previewing before making changes.",
    );
  }
  return ctx.actor;
}

/** Like requireActor, but also checks the real user holds one of these roles. */
export async function requireActorRole(...roles: Role[]): Promise<User> {
  const actor = await requireActor();
  if (!roles.includes(actor.role)) {
    throw new Error("You do not have permission to do that.");
  }
  return actor;
}
