import { redirect } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { Topbar } from "@/components/Topbar";
import { requireViewContext } from "@/lib/preview";
import { sectionsForInstructor, studentsForInstructor } from "@/lib/queries";
import { homeFor } from "@/lib/session";
import { deliverableCount, submissionCountsByStudent } from "@/lib/submissions";

export default async function InstructorHome() {
  const { actor, subject, previewing } = await requireViewContext();

  if (subject.role === "student") redirect(homeFor(subject.role));

  const [sections, students, total] = await Promise.all([
    sectionsForInstructor(subject.id),
    studentsForInstructor(subject.id),
    deliverableCount(),
  ]);

  const counts = await submissionCountsByStudent(students.map((s) => s.id));

  const bySection = new Map<number, typeof students>();
  for (const s of students) {
    const list = bySection.get(s.sectionId) ?? [];
    list.push(s);
    bySection.set(s.sectionId, list);
  }

  const awaiting = students.reduce((n, s) => n + (counts.get(s.id)?.awaiting ?? 0), 0);

  return (
    <>
      <Topbar user={subject} />
      {previewing ? <PreviewBanner actor={actor} subject={subject} /> : null}
      <main className="wrap">
        <h1>Your sections</h1>
        <p className="sub">
          You see only students enrolled in sections assigned to you.
          {subject.role === "admin"
            ? " As an admin, assign yourself a section to see students here."
            : ""}
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
            <b>{awaiting}</b>
            <span>submissions to review</span>
          </div>
        </div>

        {sections.length === 0 ? (
          <div className="card empty">
            No sections are assigned to you yet. An admin assigns sections from the roster import.
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
                          <th>Submitted</th>
                          <th>To review</th>
                          <th>Needs work</th>
                          <th />
                        </tr>
                      </thead>
                      <tbody>
                        {roster.map((s) => {
                          const c = counts.get(s.id);
                          return (
                            <tr key={s.id}>
                              <td>{s.ucinetid}</td>
                              <td>{s.name ?? "—"}</td>
                              <td>
                                {c?.submitted ?? 0}/{total}
                              </td>
                              <td>
                                {c?.awaiting ? (
                                  <span className="pill invited">{c.awaiting}</span>
                                ) : (
                                  "—"
                                )}
                              </td>
                              <td>{c?.needsWork ? c.needsWork : "—"}</td>
                              <td>
                                <a href={`/instructor/student/${s.id}`}>Open</a>
                              </td>
                            </tr>
                          );
                        })}
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
