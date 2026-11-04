import { signOutEverywhere } from "@/app/actions";
import type { User } from "@/lib/db/schema";

export function Topbar({ user }: { user: User }) {
  return (
    <header className="topbar">
      <strong>OPS Submissions</strong>
      <nav>
        <span className="who">
          {user.name ?? user.ucinetid} &middot; {user.role}
        </span>
        {user.role === "admin" ? <a href="/admin">Admin</a> : null}
        {user.role === "admin" || user.role === "instructor" ? (
          <a href="/instructor">Instructor</a>
        ) : null}
        <form action={signOutEverywhere}>
          <button className="btn ghost" style={{ padding: "4px 10px", color: "#fff" }}>
            Sign out
          </button>
        </form>
      </nav>
    </header>
  );
}
