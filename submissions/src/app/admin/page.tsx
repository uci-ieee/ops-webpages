import { Topbar } from "@/components/Topbar";
import { adminOverview, allUsers } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export default async function AdminHome() {
  const user = await requireRole("admin");

  const [overview, roster] = await Promise.all([adminOverview(), allUsers()]);
  const instructors = roster.filter((u) => u.role === "instructor");

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <h1>Admin</h1>
        <p className="sub">Everything, across every section and instructor.</p>

        <div className="tiles">
          <div className="tile">
            <b>{overview.totals.student ?? 0}</b>
            <span>students</span>
          </div>
          <div className="tile">
            <b>{overview.totals.instructor ?? 0}</b>
            <span>instructors</span>
          </div>
          <div className="tile">
            <b>{overview.totals.admin ?? 0}</b>
            <span>admins</span>
          </div>
          <div className="tile">
            <b>{overview.sections.length}</b>
            <span>sections</span>
          </div>
          <div className="tile">
            <b>{roster.filter((u) => u.status === "active").length}</b>
            <span>have signed in</span>
          </div>
        </div>

        <h2>Sections</h2>
        {overview.sections.length === 0 ? (
          <div className="card empty">No sections yet. Run `npm run db:seed` to load a roster.</div>
        ) : (
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Year</th>
                  <th>Instructor(s)</th>
                  <th>Students</th>
                </tr>
              </thead>
              <tbody>
                {overview.sections.map((s) => (
                  <tr key={s.id}>
                    <td>{s.code}</td>
                    <td>{s.name}</td>
                    <td>{s.year}</td>
                    <td>{s.instructors.length ? s.instructors.join(", ") : "— unassigned —"}</td>
                    <td>{s.students}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>Instructors</h2>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>UCInetID</th>
                <th>Name</th>
                <th>Status</th>
                <th>Sections</th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((i) => (
                <tr key={i.id}>
                  <td>{i.ucinetid}</td>
                  <td>{i.name ?? "—"}</td>
                  <td>
                    <span className={`pill ${i.status}`}>{i.status}</span>
                  </td>
                  <td>
                    {overview.sections
                      .filter((s) => s.instructors.includes(i.name ?? i.ucinetid))
                      .map((s) => s.code)
                      .join(", ") || "— none —"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Full roster ({roster.length})</h2>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>UCInetID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Status</th>
                <th>Email</th>
                <th>Last sign-in</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((u) => (
                <tr key={u.id}>
                  <td>{u.ucinetid}</td>
                  <td>{u.name ?? "—"}</td>
                  <td>{u.role}</td>
                  <td>
                    <span className={`pill ${u.status}`}>{u.status}</span>
                  </td>
                  <td>{u.email ?? "—"}</td>
                  <td>{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleDateString() : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2>Manage</h2>
        <div className="card">
          <p style={{ margin: 0 }}>
            <a href="/admin/roster">Import a roster</a> &mdash; paste students, instructors, and
            section assignments in one go.
          </p>
        </div>

        <h2>Not built yet</h2>
        <div className="card empty">
          Changing one person&rsquo;s role or section from this page, and file submissions. Roster
          changes go through the import above for now.
        </div>
      </main>
    </>
  );
}
