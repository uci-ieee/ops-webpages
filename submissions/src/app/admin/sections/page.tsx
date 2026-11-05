import { Topbar } from "@/components/Topbar";
import { allUsers } from "@/lib/queries";
import { CURRENT_YEAR } from "@/lib/roster";
import { instructorSectionMap, listSections, studentSectionMap } from "@/lib/sections";
import { requireRole } from "@/lib/session";
import { createSection, moveStudent } from "./actions";

export default async function SectionsPage() {
  const user = await requireRole("admin");

  const [roster, sectionList, studentMap, instructorMap] = await Promise.all([
    allUsers(),
    listSections(),
    studentSectionMap(),
    instructorSectionMap(),
  ]);

  const students = roster.filter((u) => u.role === "student");
  const staff = roster.filter((u) => u.role === "instructor" || u.role === "admin");

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="sub" style={{ marginBottom: 4 }}>
          <a href="/admin">&larr; Admin</a>
        </p>
        <h1>Sections</h1>
        <p className="sub">
          Create sections, then assign students and whoever runs them. An instructor only ever
          sees students in sections assigned to them, so this page is what controls that.
        </p>

        <h2>Create a section</h2>
        <div className="card">
          <form action={createSection} className="inline-form">
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Code</span>
              <input name="code" placeholder="S01" required style={{ maxWidth: 110 }} />
            </label>
            <label className="field" style={{ marginBottom: 0, flex: 1 }}>
              <span>Name</span>
              <input name="name" placeholder="Monday 5pm" />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>Year</span>
              <input name="year" defaultValue={CURRENT_YEAR} style={{ maxWidth: 140 }} />
            </label>
            <button className="btn">Create</button>
          </form>
        </div>

        <h2>
          Existing sections <span className="pill">{sectionList.length}</span>
        </h2>
        {sectionList.length === 0 ? (
          <div className="card empty">
            No sections yet. Create one above, then assign people to it.
          </div>
        ) : (
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Year</th>
                  <th>Runs it</th>
                  <th>Students</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sectionList.map((s) => {
                  const runners = staff
                    .filter((p) => (instructorMap.get(p.id) ?? []).includes(s.code))
                    .map((p) => p.name ?? p.ucinetid);
                  const count = [...studentMap.values()].filter((v) => v.id === s.id).length;
                  return (
                    <tr key={s.id}>
                      <td>{s.code}</td>
                      <td>{s.name}</td>
                      <td>{s.year}</td>
                      <td>{runners.length ? runners.join(", ") : "— nobody —"}</td>
                      <td>{count}</td>
                      <td>
                        <a href={`/admin/sections/${s.id}`}>Manage</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2>
          Students <span className="pill">{students.length}</span>
        </h2>
        <p className="sub" style={{ marginTop: -4 }}>
          Move a student straight from here. A student sits in one section at a time.
        </p>
        {students.length === 0 ? (
          <div className="card empty">No students on the roster yet.</div>
        ) : (
          <div className="card scroll-x" style={{ padding: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>UCInetID</th>
                  <th>Name</th>
                  <th>Section</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {students.map((s) => {
                  const current = studentMap.get(s.id);
                  return (
                    <tr key={s.id}>
                      <td>{s.ucinetid}</td>
                      <td>{s.name ?? "—"}</td>
                      <td>{current ? current.code : <span className="empty">unassigned</span>}</td>
                      <td>
                        <form action={moveStudent} className="inline-form">
                          <input type="hidden" name="studentId" value={s.id} />
                          <select name="sectionId" defaultValue={current ? String(current.id) : "none"}>
                            <option value="none">{"— unassigned —"}</option>
                            {sectionList.map((sec) => (
                              <option key={sec.id} value={String(sec.id)}>
                                {sec.code} ({sec.year})
                              </option>
                            ))}
                          </select>
                          <button className="btn ghost" style={{ padding: "4px 12px" }}>
                            Move
                          </button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <h2>
          Instructors and admins <span className="pill">{staff.length}</span>
        </h2>
        <div className="card scroll-x" style={{ padding: 0 }}>
          <table>
            <thead>
              <tr>
                <th>UCInetID</th>
                <th>Name</th>
                <th>Role</th>
                <th>Sections they see</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((p) => {
                const codes = instructorMap.get(p.id) ?? [];
                return (
                  <tr key={p.id}>
                    <td>{p.ucinetid}</td>
                    <td>{p.name ?? "—"}</td>
                    <td>{p.role}</td>
                    <td>
                      {codes.length ? codes.join(", ") : <span className="empty">none</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="sub" style={{ fontSize: 13 }}>
          Admins can be assigned a section too &mdash; that is how an officer who also runs a lab
          gets their own roster on the instructor screen.
        </p>
      </main>
    </>
  );
}
