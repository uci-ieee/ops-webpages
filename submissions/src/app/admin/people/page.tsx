import { PersonRow } from "@/components/PersonRow";
import { Topbar } from "@/components/Topbar";
import { allUsers } from "@/lib/queries";
import { instructorSectionMap, listSections, studentSectionMap } from "@/lib/sections";
import { requireRole } from "@/lib/session";

export default async function AdminPeoplePage() {
  const user = await requireRole("admin");

  const [roster, sectionList, studentMap, instructorMap] = await Promise.all([
    allUsers(),
    listSections(),
    studentSectionMap(),
    instructorSectionMap(),
  ]);

  const sections = sectionList.map((s) => ({ id: s.id, code: s.code, year: s.year }));
  const byCode = new Map(sectionList.map((s) => [s.code, s.id]));

  const groups = [
    { role: "student", heading: "Students" },
    { role: "instructor", heading: "Instructors" },
    { role: "admin", heading: "Admins" },
  ];

  const activeAdmins = roster.filter((u) => u.role === "admin" && u.status === "active").length;

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="crumb">
          <a href="/admin">&larr; Admin</a>
        </p>
        <h1>People</h1>
        <p className="sub">
          Change anyone&rsquo;s role or section here. Changes apply immediately &mdash; a Save
          button appears once you pick something different.
        </p>

        {activeAdmins <= 1 ? (
          <div className="notice">
            Only <strong>one</strong> admin has ever signed in. Promote a second person to admin
            and have them sign in &mdash; otherwise a single mistake here could lock everyone out
            of these pages.
          </div>
        ) : null}

        {groups.map((g) => {
          const people = roster.filter((u) => u.role === g.role);
          if (people.length === 0) return null;
          return (
            <section key={g.role}>
              <h2>
                {g.heading} <span className="pill">{people.length}</span>
              </h2>
              <div className="card table-card">
                <table>
                  <thead>
                    <tr>
                      <th>UCInetID</th>
                      <th>Name</th>
                      <th>Status</th>
                      <th>Role</th>
                      <th>Section</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => {
                      const current =
                        p.role === "student"
                          ? (studentMap.get(p.id)?.id ?? null)
                          : (byCode.get((instructorMap.get(p.id) ?? [])[0] ?? "") ?? null);
                      return (
                        <PersonRow
                          key={p.id}
                          userId={p.id}
                          ucinetid={p.ucinetid}
                          name={p.name}
                          role={p.role}
                          status={p.status}
                          currentSectionId={current}
                          sections={sections}
                          isSelf={p.id === user.id}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}

        <p className="sub" style={{ fontSize: 13 }}>
          Changing someone to <strong>student</strong> removes them from any section they ran;
          changing them to <strong>instructor</strong> or <strong>admin</strong> removes their
          student enrolment. For instructors and admins, the section column is the section they
          run. To assign several people at once, use{" "}
          <a href="/admin/sections">Sections</a> instead.
        </p>
      </main>
    </>
  );
}
