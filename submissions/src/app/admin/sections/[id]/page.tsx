import { notFound } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { allUsers } from "@/lib/queries";
import { currentMembership, getSection, studentSectionMap } from "@/lib/sections";
import { requireRole } from "@/lib/session";
import { deleteSection, setSectionMembers } from "../actions";

export default async function SectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireRole("admin");
  const { id } = await params;
  const sectionId = Number(id);
  if (!Number.isFinite(sectionId)) notFound();

  const section = await getSection(sectionId);
  if (!section) notFound();

  const [roster, membership, studentMap] = await Promise.all([
    allUsers(),
    currentMembership(sectionId),
    studentSectionMap(),
  ]);

  const students = roster.filter((u) => u.role === "student");
  const staff = roster.filter((u) => u.role === "instructor" || u.role === "admin");
  const enrolledCount = membership.students.size;

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <p className="sub" style={{ marginBottom: 4 }}>
          <a href="/admin/sections">&larr; Sections</a>
        </p>
        <h1>
          Section {section.code} &mdash; {section.name}
        </h1>
        <p className="sub">
          {section.year} &middot; {enrolledCount} student{enrolledCount === 1 ? "" : "s"} &middot;{" "}
          {membership.instructors.size} running it
        </p>

        <form action={setSectionMembers}>
          <input type="hidden" name="sectionId" value={sectionId} />

          <h2>Who runs this section</h2>
          <div className="card">
            <p className="sub" style={{ margin: "0 0 10px", fontSize: 13 }}>
              Anyone checked here sees this section&rsquo;s students on the instructor screen.
              Admins can be checked too.
            </p>
            <div className="check-grid">
              {staff.map((p) => (
                <label key={p.id} className="check">
                  <input
                    type="checkbox"
                    name="instructors"
                    value={p.id}
                    defaultChecked={membership.instructors.has(p.id)}
                  />
                  <span>
                    {p.name ?? p.ucinetid}
                    <em>
                      {p.ucinetid} &middot; {p.role}
                    </em>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <h2>Students in this section</h2>
          <div className="card">
            <p className="sub" style={{ margin: "0 0 10px", fontSize: 13 }}>
              A student belongs to one section at a time. Checking someone already in another
              section moves them here; unchecking removes them.
            </p>
            {students.length === 0 ? (
              <p className="empty" style={{ margin: 0 }}>
                No students on the roster yet.
              </p>
            ) : (
              <div className="check-grid">
                {students.map((s) => {
                  const elsewhere = studentMap.get(s.id);
                  const inAnother = elsewhere && elsewhere.id !== sectionId;
                  return (
                    <label key={s.id} className="check">
                      <input
                        type="checkbox"
                        name="students"
                        value={s.id}
                        defaultChecked={membership.students.has(s.id)}
                      />
                      <span>
                        {s.name ?? s.ucinetid}
                        <em>
                          {s.ucinetid}
                          {inAnother ? ` · currently in ${elsewhere!.code}` : ""}
                        </em>
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <button className="btn">Save membership</button>
        </form>

        <h2>Delete this section</h2>
        <div className="danger-zone">
          <p className="sub" style={{ margin: "0 0 10px", fontSize: 13 }}>
            {enrolledCount > 0
              ? `Not possible while ${enrolledCount} student${enrolledCount === 1 ? " is" : "s are"} still enrolled. Move them out first.`
              : "This section has no students, so it is safe to remove."}
          </p>
          <form action={deleteSection}>
            <input type="hidden" name="sectionId" value={sectionId} />
            <button className="btn ghost" disabled={enrolledCount > 0}>
              Delete section
            </button>
          </form>
        </div>
      </main>
    </>
  );
}
