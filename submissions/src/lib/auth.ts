import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import type { Provider } from "next-auth/providers";
import { eq } from "drizzle-orm";
import { getDb } from "./db";
import { users } from "./db/schema";
import type { Role } from "./db/schema";

/**
 * The dev-only role switcher. Gated on NODE_ENV === "development", which Next
 * sets to "production" for `next build`, so this provider is compiled out of
 * any deployed bundle -- it is not a backdoor that can ship by accident.
 */
export const DEV_LOGIN_ENABLED =
  process.env.NODE_ENV === "development" && process.env.DEV_LOGIN === "1";

const ALLOWED_DOMAIN = (process.env.ALLOWED_EMAIL_DOMAIN ?? "uci.edu").toLowerCase();

/** someone@uci.edu -> "someone". The UCInetID is the local part, by definition. */
export function ucinetidFromEmail(email: string): string {
  return email.split("@")[0]!.trim().toLowerCase();
}

async function findByUcinetid(ucinetid: string) {
  const rows = await getDb()
    .select()
    .from(users)
    .where(eq(users.ucinetid, ucinetid))
    .limit(1);
  return rows[0] ?? null;
}

const providers: Provider[] = [Google];

if (DEV_LOGIN_ENABLED) {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev role switcher",
      credentials: { ucinetid: { label: "UCInetID", type: "text" } },
      async authorize(raw) {
        const ucinetid = String(raw?.ucinetid ?? "").trim().toLowerCase();
        if (!ucinetid) return null;
        const row = await findByUcinetid(ucinetid);
        if (!row || row.status === "disabled") return null;
        return {
          id: row.id,
          email: row.email ?? `${row.ucinetid}@${ALLOWED_DOMAIN}`,
          name: row.name ?? row.ucinetid,
        };
      },
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  // Auth.js refuses to serve its endpoints in production unless the request host
  // is trusted. Vercel terminates TLS and sets a correct Host header, so trust it
  // rather than hardcoding AUTH_URL per environment.
  trustHost: true,
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 },
  pages: { signIn: "/login", error: "/login" },
  callbacks: {
    /**
     * Two gates, both required: the address must be on the campus domain, and
     * the UCInetID must already exist on the roster. Returning a string sends
     * the browser there instead of throwing a generic error page.
     */
    async signIn({ user, account }) {
      if (account?.provider === "dev-login") return true;

      const email = user.email?.toLowerCase();
      if (!email) return "/login?error=no-email";
      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) return "/login?error=domain";

      const ucinetid = ucinetidFromEmail(email);
      const row = await findByUcinetid(ucinetid);
      if (!row) return "/login?error=not-on-roster";
      if (row.status === "disabled") return "/login?error=disabled";

      await getDb()
        .update(users)
        .set({
          email,
          name: user.name ?? row.name,
          status: "active",
          lastLoginAt: new Date(),
        })
        .where(eq(users.id, row.id));

      return true;
    },

    /**
     * Runs the only identity lookup of the session, at sign-in. Everything the
     * UI needs afterwards rides in the signed cookie, so a page load costs zero
     * auth queries.
     */
    async jwt({ token, user }) {
      if (user?.email) {
        const row = await findByUcinetid(ucinetidFromEmail(user.email));
        if (row) {
          token.uid = row.id;
          token.ucinetid = row.ucinetid;
          token.role = row.role;
          token.name = row.name ?? token.name;
        }
      }
      return token;
    },

    async session({ session, token }) {
      session.user.id = (token.uid as string) ?? "";
      session.user.ucinetid = (token.ucinetid as string) ?? "";
      session.user.role = (token.role as Role) ?? "student";
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      ucinetid: string;
      role: Role;
    } & DefaultSession["user"];
  }
}
