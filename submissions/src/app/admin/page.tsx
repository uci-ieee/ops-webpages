import { Topbar } from "@/components/Topbar";
import { adminOverview, allUsers } from "@/lib/queries";
import { formatGB, measuredUsage, quotaStatus } from "@/lib/quota";
import { requireRole } from "@/lib/session";

export default async function AdminHome() {
  const user = await requireRole("admin");

  const [overview, roster, quota] = await Promise.all([
    adminOverview(),
    allUsers(),
    quotaStatus(),
  ]);

  // What storage really holds. Can exceed the recorded figure when a browser
  // completed an upload but never confirmed it, leaving an object with no row.
  let measured: { bytes: number; objects: number; truncated: boolean } | null = null;
  let measureError: string | null = null;
  try {
    measured = await measuredUsage();
  } catch (e) {
    measureError = e instanceof Error ? e.message : "could not read storage";
  }
  const orphanBytes = measured ? Math.max(0, measured.bytes - quota.usedBytes) : 0;
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

        <h2>Storage</h2>
        <div className={quota.blocked ? "error" : quota.warning ? "notice" : "card"}>
          <strong>
            {formatGB(quota.usedBytes)} of {formatGB(quota.quotaBytes)} used (
            {quota.percent.toFixed(1)}%)
          </strong>
          <div className="progress" style={{ margin: "8px 0" }}>
            <span style={{ width: `${Math.min(100, quota.percent)}%` }} />
          </div>
          {quota.blocked ? (
            <p style={{ margin: 0 }}>
              <strong>Student submissions are blocked.</strong> Nobody can upload until space is
              freed. Existing submissions and feedback are unaffected.
            </p>
          ) : quota.warning ? (
            <p style={{ margin: 0 }}>
              Past 80%. Uploads stop automatically at the limit, so free up space before that
              happens.
            </p>
          ) : (
            <p className="sub" style={{ margin: 0, fontSize: 13 }}>
              Uploads are refused automatically at the limit, so this can never run over into a
              bill.
            </p>
          )}

          <p className="sub" style={{ margin: "10px 0 0", fontSize: 13 }}>
            {measured ? (
              <>
                Storage actually holds {formatGB(measured.bytes)} across {measured.objects}{" "}
                object{measured.objects === 1 ? "" : "s"}
                {orphanBytes > 1024
                  ? ` — ${formatGB(orphanBytes)} of that is not attached to any submission (an upload that completed but was never confirmed) and is safe to delete.`
                  : " — matching the recorded total."}
              </>
            ) : (
              <>Could not read storage directly: {measureError}</>
            )}
          </p>
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
          <p style={{ margin: "8px 0 0" }}>
            <a href="/admin/sections">Sections</a> &mdash; create sections, move students between
            them, and choose who runs each one.
          </p>
          <p style={{ margin: "8px 0 0" }}>
            <a href="/admin/view-as">View as someone else</a> &mdash; see the student or instructor
            screens exactly as they do, read-only.
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
