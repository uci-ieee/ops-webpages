import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "./auth";
import { getDb } from "./db";
import { users } from "./db/schema";
import type { Role, User } from "./db/schema";

/** Where each role's work actually lives. */
export function homeFor(role: Role): string {
  if (role === "admin") return "/admin";
  if (role === "instructor") return "/instructor";
  return "/";
}

/**
 * Re-reads the row on every protected page rather than trusting the cookie's
 * copy of `role`. That means demoting or disabling someone takes effect on
 * their next click instead of whenever their token expires. It is one indexed
 * primary-key lookup against a ~150-row table, so the safety is close to free.
 */
export async function currentUser(): Promise<User | null> {
  const session = await auth();
  const ucinetid = session?.user?.ucinetid;
  if (!ucinetid) return null;

  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.ucinetid, ucinetid))
    .limit(1);

  const user = rows[0];
  if (!user || user.status === "disabled") return null;
  return user;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/** Wrong-role visitors get bounced to their own home, not to an error page. */
export async function requireRole(...roles: Role[]): Promise<User> {
  const user = await requireUser();
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
