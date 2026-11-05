import { Topbar } from "@/components/Topbar";
import { canvasConfig, checkCanvas } from "@/lib/canvas";
import { canvasSyncFailures, canvasSyncSummary } from "@/lib/canvas-sync";
import { listProjectsForAdmin } from "@/lib/projects";
import { requireRole } from "@/lib/session";
import { syncCanvasNow } from "./actions";

export default async function AdminCanvasPage() {
  const user = await requireRole("admin");

  const configured = canvasConfig() !== null;
  const [summary, failures, projects] = await Promise.all([
    canvasSyncSummary(),
    canvasSyncFailures(),
    listProjectsForAdmin(),
  ]);

  // Only probe Canvas when there is something to probe with.
  const connection = configured ? await checkCanvas() : null;
  const unmapped = projects.filter((p) => p.canvasAssignmentId === null);

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="crumb">
          <a href="/admin">&larr; Admin</a>
        </p>
        <h1>Canvas</h1>
        <p className="sub">
          Grades recorded here are pushed to Canvas. A project&rsquo;s grade is the sum of its
          deliverable scores, because Canvas holds one grade per assignment rather than one per
          file. Pushes happen moments after a review; anything that fails is retried by the daily
          sweep.
        </p>

        <h2>Connection</h2>
        {!configured ? (
          <div className="notice">
            <strong>Canvas is not configured.</strong>
            <p style={{ margin: "8px 0 0" }}>
              Set <code>CANVAS_BASE_URL</code>, <code>CANVAS_TOKEN</code> and{" "}
              <code>CANVAS_COURSE_ID</code> in the environment. Until then grades are still
              recorded here and queued, so nothing is lost &mdash; they just are not pushed.
            </p>
          </div>
        ) : connection?.ok ? (
          <div className="success">
            Connected to <strong>{connection.courseName}</strong> as {connection.user}.
          </div>
        ) : (
          <div className="error">
            <strong>Canvas rejected the connection.</strong>
            <p style={{ margin: "8px 0 0" }}>{connection?.error}</p>
          </div>
        )}

        <h2>Queue</h2>
        <div className="tiles">
          <div className="tile">
            <b>{summary.synced}</b>
            <span>pushed</span>
          </div>
          <div className="tile">
            <b>{summary.pending}</b>
            <span>waiting</span>
          </div>
          <div className="tile">
            <b>{summary.failed}</b>
            <span>failed</span>
          </div>
          <div className="tile">
            <b>{summary.skipped}</b>
            <span>not mapped</span>
          </div>
        </div>

        <div className="card">
          <div className="retention" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
            <span>
              {summary.pending === 0 && summary.failed === 0
                ? "Nothing outstanding."
                : `${summary.pending + summary.failed} grade${
                    summary.pending + summary.failed === 1 ? "" : "s"
                  } waiting to reach Canvas.`}
            </span>
            <form action={syncCanvasNow}>
              <button className="btn-quiet" disabled={!configured}>
                Push outstanding grades now
              </button>
            </form>
          </div>
        </div>

        {unmapped.length > 0 ? (
          <div className="notice">
            {unmapped.length} project{unmapped.length === 1 ? "" : "s"} have no Canvas assignment
            mapped, so their grades will never be pushed:{" "}
            {unmapped.map((p) => p.label).join(", ")}. Map them on the{" "}
            <a href="/admin/projects">Projects page</a>.
          </div>
        ) : null}

        <h2>Mapping</h2>
        <div className="card table-card">
          <table>
            <thead>
              <tr>
                <th>Project</th>
                <th>Total points</th>
                <th>Canvas assignment</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} className={p.canvasAssignmentId === null ? "row-muted" : ""}>
                  <td>
                    <strong>{p.label}</strong> {p.title}
                  </td>
                  <td>{p.pointsPossible}</td>
                  <td>
                    {p.canvasAssignmentId === null ? (
                      <span className="empty">not mapped</span>
                    ) : (
                      <code>{p.canvasAssignmentId}</code>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {failures.length > 0 ? (
          <>
            <h2>
              Problems <span className="pill">{failures.length}</span>
            </h2>
            <div className="card table-card">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Project</th>
                    <th>Grade</th>
                    <th>Attempts</th>
                    <th>What Canvas said</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f, i) => (
                    <tr key={`${f.ucinetid}-${i}`}>
                      <td>
                        <code>{f.ucinetid}</code>
                      </td>
                      <td>{f.projectLabel}</td>
                      <td>
                        {f.score}/{f.pointsPossible}
                      </td>
                      <td>{f.attempts}</td>
                      <td style={{ whiteSpace: "normal", maxWidth: 360 }}>{f.lastError}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sub" style={{ fontSize: 13 }}>
              A 401 or 403 means the token is wrong or its account cannot grade this course. A 404
              usually means the assignment id is wrong, or the student is not enrolled in the
              Canvas course. Fixing the cause and re-reviewing re-queues the push.
            </p>
          </>
        ) : null}
      </main>
    </>
  );
}
