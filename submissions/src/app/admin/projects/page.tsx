import { Topbar } from "@/components/Topbar";
import { listProjectsForAdmin } from "@/lib/projects";
import { CURRENT_YEAR } from "@/lib/roster";
import { requireRole } from "@/lib/session";
import { publishThrough, setCanvasAssignment, setProjectPublished } from "./actions";

export default async function AdminProjectsPage() {
  const user = await requireRole("admin");
  const rows = await listProjectsForAdmin();

  const visible = rows.filter((r) => r.published);
  const lastVisible = visible.length ? Math.max(...visible.map((r) => r.position)) : 0;

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="crumb">
          <a href="/admin">&larr; Admin</a>
        </p>
        <h1>Projects</h1>
        <p className="sub">
          Students only see published projects. Hidden projects stay fully set up &mdash; their
          deliverables and any existing submissions are untouched, just invisible until you
          publish.
        </p>

        <div className="tiles">
          <div className="tile">
            <b>{visible.length}</b>
            <span>visible to students</span>
          </div>
          <div className="tile">
            <b>{rows.length - visible.length}</b>
            <span>hidden</span>
          </div>
          <div className="tile">
            <b>{rows.reduce((n, r) => n + r.submissionCount, 0)}</b>
            <span>current submissions</span>
          </div>
        </div>

        <h2>Release through a project</h2>
        <div className="card">
          <p className="sub" style={{ margin: "0 0 12px", fontSize: 13 }}>
            The usual case: the program runs in order, so pick how far along students are. This
            publishes everything up to that project and hides the rest.
          </p>
          <form action={publishThrough} className="inline-form">
            <input type="hidden" name="year" value={CURRENT_YEAR} />
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Visible through</span>
              <select name="through" defaultValue={String(lastVisible)}>
                <option value="0">nothing visible</option>
                {rows.map((r) => (
                  <option key={r.id} value={String(r.position)}>
                    {r.label} &mdash; {r.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="btn">Apply</button>
          </form>
        </div>

        <h2>Every project</h2>
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Title</th>
                <th>Deliverables</th>
                <th>Points</th>
                <th>Canvas assignment</th>
                <th>Submissions</th>
                <th>Students see it</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.published ? "" : "row-muted"}>
                  <td>
                    <strong>{r.label}</strong>
                  </td>
                  <td>
                    {r.pageUrl ? (
                      <a href={r.pageUrl} target="_blank" rel="noopener noreferrer">
                        {r.title}
                      </a>
                    ) : (
                      r.title
                    )}
                  </td>
                  <td>{r.deliverableCount}</td>
                  <td>{r.pointsPossible}</td>
                  <td>
                    <form action={setCanvasAssignment} className="cell-form">
                      <input type="hidden" name="projectId" value={r.id} />
                      <input
                        name="canvasAssignmentId"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="not mapped"
                        defaultValue={r.canvasAssignmentId ?? ""}
                        style={{ width: 118 }}
                      />
                      <button className="btn-quiet">Save</button>
                    </form>
                  </td>
                  <td>{r.submissionCount || "—"}</td>
                  <td>
                    {r.published ? (
                      <span className="pill active">Visible</span>
                    ) : (
                      <span className="pill">Hidden</span>
                    )}
                  </td>
                  <td>
                    <form action={setProjectPublished}>
                      <input type="hidden" name="projectId" value={r.id} />
                      <input type="hidden" name="published" value={r.published ? "0" : "1"} />
                      <button className="btn-quiet">{r.published ? "Hide" : "Publish"}</button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ fontSize: 13 }}>
          The Canvas assignment id is the number in the assignment’s URL. A project’s grade is
          the sum of its deliverable scores, so set the Canvas assignment to the same total points
          shown here. Leave it blank to keep a project out of Canvas entirely. Sync status is on the{" "}
          <a href="/admin/canvas">Canvas page</a>.
        </p>
        <p className="sub" style={{ fontSize: 13 }}>
          Hiding a project with submissions does not delete anything &mdash; instructors keep
          seeing the work, and students stop seeing the project.
        </p>
      </main>
    </>
  );
}
