import { Topbar } from "@/components/Topbar";
import { CURRENT_YEAR } from "@/lib/roster";
import { adminOverview, allUsers } from "@/lib/queries";
import { requireRole } from "@/lib/session";
import { RosterForm } from "./RosterForm";

export default async function RosterPage() {
  const user = await requireRole("admin");
  const [roster, overview] = await Promise.all([allUsers(), adminOverview()]);

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="sub" style={{ marginBottom: 4 }}>
          <a href="/admin">&larr; Admin</a>
        </p>
        <h1>Roster import</h1>
        <p className="sub">
          Paste a whole roster at once. Copying cells straight out of Google Sheets or Excel works
          — tabs and commas are both accepted.
        </p>

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

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Columns</h2>
          <table>
            <thead>
              <tr>
                <th>Column</th>
                <th>Required</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <code>ucinetid</code>
                </td>
                <td>yes</td>
                <td>A full @uci.edu address works too — the domain is stripped</td>
              </tr>
              <tr>
                <td>
                  <code>name</code>
                </td>
                <td>no</td>
                <td>Replaced by their Google name on first sign-in</td>
              </tr>
              <tr>
                <td>
                  <code>role</code>
                </td>
                <td>no</td>
                <td>
                  <code>student</code> (default), <code>instructor</code>, or <code>admin</code>
                </td>
              </tr>
              <tr>
                <td>
                  <code>section_code</code>
                </td>
                <td>for instructors</td>
                <td>Creates the section if it does not exist</td>
              </tr>
              <tr>
                <td>
                  <code>section_name</code>
                </td>
                <td>no</td>
                <td>Human label, e.g. &ldquo;Monday 5pm&rdquo;</td>
              </tr>
            </tbody>
          </table>
          <p className="sub" style={{ margin: "12px 0 0", fontSize: 13 }}>
            The header row is optional. Without one, columns are read in the order above, so
            pasting a single line like <code>pantera,Peter Anteater,student,S01</code> works.
          </p>
          <p className="sub" style={{ margin: "8px 0 0", fontSize: 13 }}>
            Re-importing the same list is safe — everyone is matched on UCInetID and updated in
            place, never duplicated. Importing never removes anyone, and never resets someone who
            has already signed in.
          </p>
        </div>

        <RosterForm defaultYear={CURRENT_YEAR} />
      </main>
    </>
  );
}
