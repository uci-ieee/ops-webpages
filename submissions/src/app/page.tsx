import { redirect } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { sectionsForStudent } from "@/lib/queries";
import { homeFor, requireUser } from "@/lib/session";

export default async function StudentHome() {
  const user = await requireUser();
  if (user.role !== "student") redirect(homeFor(user.role));

  const sections = await sectionsForStudent(user.id);

  return (
    <>
      <Topbar user={user} />
      <main className="wrap">
        <h1>Welcome, {user.name ?? user.ucinetid}</h1>
        <p className="sub">UCInetID: {user.ucinetid}</p>

        <h2>Your section</h2>
        {sections.length === 0 ? (
          <div className="card empty">
            You are on the roster but not assigned to a section yet. An officer needs to add you
            to one.
          </div>
        ) : (
          sections.map((s) => (
            <div className="card" key={s.id}>
              <strong>
                Section {s.code} &mdash; {s.name}
              </strong>
              <p className="sub" style={{ margin: "6px 0 0" }}>
                {s.year}
                {s.instructors.length > 0 ? ` · Instructor: ${s.instructors.join(", ")}` : ""}
              </p>
            </div>
          ))
        )}

        <h2>Your submissions</h2>
        <div className="card empty">
          Nothing to submit here yet. Project uploads land in this spot next &mdash; for now, keep
          turning deliverables in through Canvas.
        </div>
      </main>
    </>
  );
}
