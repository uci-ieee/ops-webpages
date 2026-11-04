import { Topbar } from "@/components/Topbar";
import { sectionsForInstructor, studentsForInstructor } from "@/lib/queries";
import { requireRole } from "@/lib/session";

export default async function InstructorHome() {
  // Admins can look at this view too; students cannot reach it at all.
  const user = await requireRole("instructor", "admin");

  const [sections, students] = await Promise.all([
    sectionsForInstructor(user.id),
    studentsForInstructor(user.id),
  ]);

  const bySection = new Map<number, typeof students>();
  for (const s of students) {
    const list = bySection.get(s.sectionId) ?? [];
    list.push(s);
    bySection.set(s.sectionId, list);
  }

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <h1>Your sections</h1>
        <p className="sub">
          You see only the students enrolled in sections assigned to you.
          {user.role === "admin" ? " (As an admin, assign yourself sections to see them here.)" : ""}
        </p>

        <div className="tiles">
          <div className="tile">
            <b>{sections.length}</b>
            <span>section{sections.length === 1 ? "" : "s"}</span>
          </div>
          <div className="tile">
            <b>{students.length}</b>
            <span>students</span>
          </div>
          <div className="tile">
            <b>{students.filter((s) => s.status === "active").length}</b>
            <span>signed in at least once</span>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="card empty">
            No sections are assigned to you yet. An admin assigns sections on the Admin page.
          </div>
        ) : (
          sections.map((section) => {
            const roster = bySection.get(section.id) ?? [];
            return (
              <section key={section.id}>
                <h2>
                  Section {section.code} &mdash; {section.name}{" "}
                  <span className="pill">{roster.length} students</span>
                </h2>
                {roster.length === 0 ? (
                  <div className="card empty">Nobody is enrolled in this section yet.</div>
                ) : (
                  <div className="card scroll-x" style={{ padding: 0 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>UCInetID</th>
                          <th>Name</th>
                          <th>Status</th>
                          <th>Last sign-in</th>
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map((s) => (
                          <tr key={s.id}>
                            <td>{s.ucinetid}</td>
                            <td>{s.name ?? "—"}</td>
                            <td>
                              <span className={`pill ${s.status}`}>{s.status}</span>
                            </td>
                            <td>
                              {s.lastLoginAt
                                ? new Date(s.lastLoginAt).toLocaleDateString()
                                : "never"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })
        )}
      </main>
    </>
  );
}
