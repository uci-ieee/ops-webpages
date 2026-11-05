import { Topbar } from "@/components/Topbar";
import { allUsers } from "@/lib/queries";
import { getPreviewTarget } from "@/lib/preview";
import { requireRole } from "@/lib/session";
import { startPreview } from "./actions";

export default async function ViewAsPage() {
  const user = await requireRole("admin");
  const [roster, active] = await Promise.all([allUsers(), getPreviewTarget()]);

  const groups: { role: string; heading: string; blurb: string }[] = [
    { role: "student", heading: "Students", blurb: "See their projects, deliverables and feedback." },
    {
      role: "instructor",
      heading: "Instructors",
      blurb: "See exactly which students and submissions they can reach.",
    },
    { role: "admin", heading: "Admins", blurb: "" },
  ];

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="sub" style={{ marginBottom: 4 }}>
          <a href="/admin">&larr; Admin</a>
        </p>
        <h1>View as</h1>
        <p className="sub">
          Look at the app exactly as someone else sees it. This is read-only: uploading and
          reviewing are disabled while a preview is active, so you cannot submit work or grade as
          another person.
        </p>

        {active ? (
          <div className="notice">
            Currently previewing <strong>{active}</strong>. Use the banner at the top of any page
            to stop, or pick someone else below.
          </div>
        ) : null}

        <div className="card">
          <p className="sub" style={{ margin: 0, fontSize: 13 }}>
            The preview lasts one hour, then expires on its own. It only works because you are an
            admin &mdash; the cookie grants nothing by itself, and is re-checked against your real
            account on every request.
          </p>
        </div>

        {groups.map((g) => {
          const people = roster.filter((u) => u.role === g.role);
          if (people.length === 0) return null;
          return (
            <section key={g.role}>
              <h2>
                {g.heading} <span className="pill">{people.length}</span>
              </h2>
              {g.blurb ? (
                <p className="sub" style={{ marginTop: -4 }}>
                  {g.blurb}
                </p>
              ) : null}
              <div className="card scroll-x" style={{ padding: 0 }}>
                <table>
                  <thead>
                    <tr>
                      <th>UCInetID</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id}>
                        <td>{p.ucinetid}</td>
                        <td>{p.name ?? "—"}</td>
                        <td>
                          <span className={`pill ${p.status}`}>{p.status}</span>
                        </td>
                        <td>
                          {p.ucinetid === user.ucinetid ? (
                            <span className="sub" style={{ fontSize: 12 }}>
                              that&rsquo;s you
                            </span>
                          ) : (
                            <form action={startPreview}>
                              <input type="hidden" name="ucinetid" value={p.ucinetid} />
                              <button className="btn ghost" style={{ padding: "4px 12px" }}>
                                View as
                              </button>
                            </form>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </main>
    </>
  );
}
