import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { DeleteSubmissionButton } from "@/components/DeleteSubmissionButton";
import { PreviewBanner } from "@/components/PreviewBanner";
import { ReviewForm } from "@/components/ReviewForm";
import { Topbar } from "@/components/Topbar";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireViewContext } from "@/lib/preview";
import { instructorCanSeeStudent, sectionsForStudent } from "@/lib/queries";
import { homeFor } from "@/lib/session";
import { getProgressFor, tally, type SubmissionView } from "@/lib/submissions";
import { formatBytes, presignDownload } from "@/lib/storage";

const KIND_LABEL: Record<string, string> = {
  video: "Video",
  photo: "Photo",
  sketch: "Sketch",
  kicad: "KiCad",
  archive: "Zip",
};

function when(d: Date): string {
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function StudentReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { actor, subject, previewing } = await requireViewContext();

  if (subject.role === "student") redirect(homeFor(subject.role));

  // Authorization, not just filtering: a guessed student id must fail even
  // though the roster list would never have shown it.
  if (subject.role !== "admin") {
    const allowed = await instructorCanSeeStudent(subject.id, id);
    if (!allowed) notFound();
  }

  const studentRows = await getDb().select().from(users).where(eq(users.id, id)).limit(1);
  const student = studentRows[0];
  if (!student || student.role !== "student") notFound();

  const [sections, progress] = await Promise.all([
    sectionsForStudent(student.id),
    getProgressFor(student.id, { publishedOnly: false }),
  ]);
  const counts = tally(progress);

  const urls = new Map<string, string>();
  for (const p of progress) {
    for (const d of p.deliverables) {
      const sign = async (s: SubmissionView, forceDownload: boolean) => {
        if (s.fileDeletedAt) return;
        urls.set(
          s.id,
          await presignDownload({
            key: s.storageKey,
            downloadAs: forceDownload ? `${student.ucinetid}-${s.filename}` : undefined,
          }),
        );
      };
      if (d.latest) await sign(d.latest, false);
      // Earlier attempts are download-only on purpose.
      for (const h of d.history) await sign(h, true);
    }
  }

  return (
    <>
      <Topbar user={subject} />
      {previewing ? <PreviewBanner actor={actor} subject={subject} /> : null}
      <main className="wrap">
        <p className="sub" style={{ marginBottom: 4 }}>
          <a href="/instructor">&larr; Your sections</a>
        </p>
        <h1>{student.name ?? student.ucinetid}</h1>
        <p className="sub">
          {student.ucinetid}
          {student.email ? ` · ${student.email}` : ""}
          {sections.length ? ` · Section ${sections.map((s) => s.code).join(", ")}` : ""}
          {" · "}
          {counts.submitted}/{counts.required} submitted
        </p>

        {progress.map((project) => {
          const submitted = project.deliverables.filter((d) => d.latest);

          // Hidden projects are still shown when there is work to review --
          // hiding a project must not hide submissions already made against
          // it -- but a hidden project with nothing in it is just noise.
          if (!project.published && submitted.length === 0) return null;

          if (submitted.length === 0) {
            return (
              <section key={project.id}>
                <h2>
                  {project.label}: {project.title}
                </h2>
                <div className="card empty">Nothing submitted for this project yet.</div>
              </section>
            );
          }

          return (
            <section key={project.id}>
              <h2>
                {project.label}: {project.title}{" "}
                <span className="pill">
                  {submitted.length}/{project.deliverables.length}
                </span>
                {!project.published ? <span className="pill">Hidden from students</span> : null}
              </h2>

              {project.deliverables.map((d) => (
                <div className="card" key={d.id}>
                  <div className="deliverable-head">
                    <span className={`kind kind-${d.kind}`}>{KIND_LABEL[d.kind] ?? d.kind}</span>
                    <strong>{d.label}</strong>
                    {d.latest?.review ? (
                      <span
                        className={`pill ${d.latest.review.status === "approved" ? "active" : "invited"}`}
                      >
                        {d.latest.review.status === "approved" ? "Approved" : "Needs work"}
                      </span>
                    ) : d.latest ? (
                      <span className="pill invited">Awaiting review</span>
                    ) : (
                      <span className="pill">Not submitted</span>
                    )}
                  </div>

                  {!d.latest ? (
                    <p className="empty" style={{ margin: "8px 0 0" }}>
                      Not submitted.
                    </p>
                  ) : (
                    <div className="submission">
                      <p className="sub" style={{ margin: "0 0 6px", fontSize: 13 }}>
                        {d.latest.filename} &middot; {formatBytes(d.latest.bytes)}
                        {d.latest.durationSeconds
                          ? ` · ${Math.round(d.latest.durationSeconds)}s`
                          : ""}{" "}
                        &middot; {when(d.latest.submittedAt)}
                        {d.latest.version > 1 ? ` · attempt ${d.latest.version}` : ""}
                      </p>

                      {d.latest.fileDeletedAt ? (
                        <p className="empty" style={{ margin: 0 }}>
                          File purged to save storage. The submission record and your feedback
                          remain.
                        </p>
                      ) : d.kind === "video" ? (
                        <video controls preload="metadata" src={urls.get(d.latest.id)} />
                      ) : d.kind === "photo" ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={urls.get(d.latest.id)} alt={d.label} />
                      ) : (
                        <a href={urls.get(d.latest.id)}>Download {d.latest.filename}</a>
                      )}

                      {d.history.length > 0 ? (
                        <details style={{ marginTop: 10 }}>
                          <summary className="sub" style={{ fontSize: 13, cursor: "pointer" }}>
                            {d.history.length} earlier attempt
                            {d.history.length === 1 ? "" : "s"} (download only)
                          </summary>
                          <ul className="history">
                            {d.history.map((h) => (
                              <li key={h.id}>
                                Attempt {h.version} &middot; {when(h.submittedAt)} &middot;{" "}
                                {h.fileDeletedAt ? (
                                  <span className="empty">file purged</span>
                                ) : (
                                  <a href={urls.get(h.id)}>download</a>
                                )}
                                {" · "}
                                <DeleteSubmissionButton
                                  submissionId={h.id}
                                  label="delete"
                                  what={`attempt ${h.version}`}
                                  disabled={previewing}
                                />
                              </li>
                            ))}
                          </ul>
                        </details>
                      ) : null}

                      <div className="submission-actions">
                        <DeleteSubmissionButton
                          submissionId={d.latest.id}
                          label="Delete this submission"
                          what={`${student.ucinetid}’s submission for "${d.label}"`}
                          disabled={previewing}
                        />
                      </div>

                      <ReviewForm
                        submissionId={d.latest.id}
                        pointsPossible={d.pointsPossible}
                        current={
                          d.latest.review
                            ? {
                                status: d.latest.review.status,
                                score: d.latest.review.score,
                                comment: d.latest.review.comment,
                              }
                            : null
                        }
                        disabled={previewing}
                      />
                    </div>
                  )}
                </div>
              ))}
            </section>
          );
        })}
      </main>
    </>
  );
}
