import { Topbar } from "@/components/Topbar";
import { adminOverview, allUsers } from "@/lib/queries";
import { listProjectsForAdmin } from "@/lib/projects";
import { formatGB, measuredUsage, quotaStatus } from "@/lib/quota";
import { studentSectionMap } from "@/lib/sections";
import { requireRole } from "@/lib/session";

function when(d: Date | null): string {
  if (!d) return "never";
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default async function AdminHome() {
  const user = await requireRole("admin");

  const [overview, roster, quota, projects, studentMap] = await Promise.all([
    adminOverview(),
    allUsers(),
    quotaStatus(),
    listProjectsForAdmin(),
    studentSectionMap(),
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

  const students = roster.filter((u) => u.role === "student");
  const visibleProjects = projects.filter((p) => p.published);

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <h1>Admin</h1>
        <p className="sub">Everything, across every section and project.</p>

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
            <b>
              {visibleProjects.length}
              <span className="of">/{projects.length}</span>
            </b>
            <span>projects visible</span>
          </div>
          <div className="tile">
            <b>{roster.filter((u) => u.status === "active").length}</b>
            <span>have signed in</span>
          </div>
        </div>

        <h2>Manage</h2>
        <div className="link-grid">
          <a className="link-card" href="/admin/projects">
            <strong>Projects</strong>
            <span>
              Publish or hide projects. Students currently see{" "}
              {visibleProjects.length === 0
                ? "nothing"
                : visibleProjects.map((p) => p.label).join(", ")}
              .
            </span>
          </a>
          <a className="link-card" href="/admin/people">
            <strong>People</strong>
            <span>Change one person&rsquo;s role or section.</span>
          </a>
          <a className="link-card" href="/admin/sections">
            <strong>Sections</strong>
            <span>Create sections and assign students and staff in bulk.</span>
          </a>
          <a className="link-card" href="/admin/roster">
            <strong>Roster import</strong>
            <span>Paste a whole roster at once, from a spreadsheet or CSV.</span>
          </a>
          <a className="link-card" href="/admin/view-as">
            <strong>View as</strong>
            <span>See the student or instructor screens exactly as they do.</span>
          </a>
          <a className="link-card" href="/instructor">
            <strong>Review work</strong>
            <span>Your own sections, if any are assigned to you.</span>
          </a>
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
                  ? ` — ${formatGB(orphanBytes)} of that is not attached to any submission and is safe to delete.`
                  : " — matching the recorded total."}
              </>
            ) : (
              <>Could not read storage directly: {measureError}</>
            )}
          </p>
        </div>

        <h2>Sections</h2>
        {overview.sections.length === 0 ? (
          <div className="card empty">
            No sections yet. <a href="/admin/sections">Create one</a>.
          </div>
        ) : (
          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Runs it</th>
                  <th>Students</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {overview.sections.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.code}</strong>
                    </td>
                    <td>{s.name}</td>
                    <td>
                      {s.instructors.length ? (
                        s.instructors.join(", ")
                      ) : (
                        <span className="empty">nobody</span>
                      )}
                    </td>
                    <td>{s.students}</td>
                    <td>
                      <a href={`/admin/sections/${s.id}`}>Manage</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <h2>
          Students <span className="pill">{students.length}</span>
        </h2>
        {students.length === 0 ? (
          <div className="card empty">
            No students yet. <a href="/admin/roster">Import a roster</a>.
          </div>
        ) : (
          <div className="card table-card">
            <table>
              <thead>
                <tr>
                  <th>UCInetID</th>
                  <th>Name</th>
                  <th>Section</th>
                  <th>Status</th>
                  <th>Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {students.map((u) => {
                  const section = studentMap.get(u.id);
                  return (
                    <tr key={u.id}>
                      <td>
                        <code>{u.ucinetid}</code>
                      </td>
                      <td>{u.name ?? "—"}</td>
                      <td>
                        {section ? section.code : <span className="empty">unassigned</span>}
                      </td>
                      <td>
                        <span className={`pill ${u.status}`}>{u.status}</span>
                      </td>
                      <td>{when(u.lastLoginAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="sub" style={{ fontSize: 13 }}>
          Instructors and admins are managed on the <a href="/admin/people">People</a> page.
        </p>
      </main>
    </>
  );
}
