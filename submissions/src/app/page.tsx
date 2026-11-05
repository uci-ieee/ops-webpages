import { redirect } from "next/navigation";
import { PreviewBanner } from "@/components/PreviewBanner";
import { Topbar } from "@/components/Topbar";
import { DeleteSubmissionButton } from "@/components/DeleteSubmissionButton";
import { UploadField } from "@/components/UploadField";
import { requireViewContext } from "@/lib/preview";
import { sectionsForStudent } from "@/lib/queries";
import { homeFor } from "@/lib/session";
import { getProgressFor, tally, type SubmissionView } from "@/lib/submissions";
import { quotaStatus } from "@/lib/quota";
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

export default async function StudentHome() {
  const { actor, subject, previewing } = await requireViewContext();

  // An admin or instructor who is not previewing belongs on their own page.
  if (subject.role !== "student") redirect(homeFor(subject.role));

  const [sections, progress, quota] = await Promise.all([
    sectionsForStudent(subject.id),
    getProgressFor(subject.id, { publishedOnly: true }),
    quotaStatus(),
  ]);
  const counts = tally(progress);

  // Presign only what exists. Signing is local (no network), but there is no
  // reason to mint URLs for files that were never uploaded.
  const urls = new Map<string, string>();
  for (const p of progress) {
    for (const d of p.deliverables) {
      const sign = async (s: SubmissionView, forceDownload: boolean) => {
        if (s.fileDeletedAt) return;
        urls.set(
          s.id,
          await presignDownload({
            key: s.storageKey,
            downloadAs: forceDownload ? s.filename : undefined,
          }),
        );
      };
      if (d.latest) await sign(d.latest, false);
      for (const h of d.history) await sign(h, true);
    }
  }

  const canUpload = !previewing && !quota.blocked;
  const uploadDisabledReason = previewing
    ? "Read-only preview — uploading is disabled."
    : "Submissions are paused — OPS has hit its storage limit. Tell an officer.";

  return (
    <>
      <Topbar user={subject} />
      {previewing ? <PreviewBanner actor={actor} subject={subject} /> : null}
      <main className="wrap">
        <h1>{subject.name ?? subject.ucinetid}</h1>
        <p className="sub">
          UCInetID {subject.ucinetid}
          {sections.length > 0
            ? ` · Section ${sections.map((s) => s.code).join(", ")}`
            : " · no section assigned yet"}
        </p>

        {quota.blocked ? (
          <div className="error">
            <strong>Submissions are paused.</strong> OPS has reached its file storage limit, so
            nobody can upload right now. This is not your fault, and nothing you have already
            submitted is affected. Let an OPS officer know.
          </div>
        ) : null}

        <div className="tiles">
          <div className="tile">
            <b>
              {counts.submitted}/{counts.required}
            </b>
            <span>deliverables submitted</span>
          </div>
          <div className="tile">
            <b>{counts.needsWork}</b>
            <span>need rework</span>
          </div>
        </div>

        {progress.length === 0 ? (
          <div className="card empty">No projects have been set up for this year yet.</div>
        ) : null}

        {progress.map((project) => {
          const done = project.deliverables.filter((d) => d.latest).length;
          return (
            <section key={project.id}>
              <h2>
                {project.label}: {project.title}{" "}
                <span className="pill">
                  {done}/{project.deliverables.length}
                </span>
              </h2>
              {project.pageUrl ? (
                <p className="sub" style={{ marginTop: -4 }}>
                  <a href={project.pageUrl} target="_blank" rel="noopener noreferrer">
                    Project instructions
                  </a>
                </p>
              ) : null}

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
                        {d.latest.review.score !== null
                          ? " " + d.latest.review.score + "/" + d.pointsPossible
                          : ""}
                      </span>
                    ) : d.latest ? (
                      <span className="pill">Submitted</span>
                    ) : (
                      <span className="pill">Not submitted</span>
                    )}
                  </div>

                  {d.instructions ? (
                    <p className="sub" style={{ margin: "8px 0 0" }}>
                      {d.instructions}
                    </p>
                  ) : null}

                  {d.latest ? (
                    <div className="submission">
                      <p className="sub" style={{ margin: "0 0 6px", fontSize: 13 }}>
                        {d.latest.filename} &middot; {formatBytes(d.latest.bytes)}
                        {d.latest.durationSeconds
                          ? ` · ${Math.round(d.latest.durationSeconds)}s`
                          : ""}{" "}
                        &middot; submitted {when(d.latest.submittedAt)}
                        {d.latest.version > 1 ? ` · attempt ${d.latest.version}` : ""}
                      </p>

                      {d.latest.fileDeletedAt ? (
                        <p className="empty" style={{ margin: 0 }}>
                          The file has been removed to save storage. Your submission and any
                          feedback are still on record.
                        </p>
                      ) : d.kind === "video" ? (
                        <video controls preload="metadata" src={urls.get(d.latest.id)} />
                      ) : d.kind === "photo" ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={urls.get(d.latest.id)} alt={d.label} />
                      ) : (
                        <a href={urls.get(d.latest.id)}>Download {d.latest.filename}</a>
                      )}

                      {d.latest.review?.comment ? (
                        <div className="feedback">
                          <strong>Feedback</strong>
                          <p style={{ margin: "4px 0 0" }}>{d.latest.review.comment}</p>
                          <p className="sub" style={{ margin: "4px 0 0", fontSize: 12 }}>
                            {d.latest.review.reviewer} &middot; {when(d.latest.review.reviewedAt)}
                          </p>
                        </div>
                      ) : null}

                      <div className="submission-actions">
                        <DeleteSubmissionButton
                          submissionId={d.latest.id}
                          label="Delete this submission"
                          what={`your submission for "${d.label}"`}
                          disabled={previewing}
                        />
                      </div>
                    </div>
                  ) : null}

                  {d.history.length > 0 ? (
                    <details style={{ marginTop: 10 }}>
                      <summary className="sub" style={{ fontSize: 13, cursor: "pointer" }}>
                        {d.history.length} earlier attempt{d.history.length === 1 ? "" : "s"}
                      </summary>
                      <ul className="history">
                        {d.history.map((h) => (
                          <li key={h.id}>
                            Attempt {h.version} &middot; {when(h.submittedAt)} &middot;{" "}
                            {h.fileDeletedAt ? (
                              <span className="empty">file removed</span>
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

                  <UploadField
                    deliverableId={d.id}
                    kind={d.kind}
                    maxBytes={d.maxBytes}
                    maxSeconds={d.maxSeconds}
                    allowedExtensions={d.allowedExtensions}
                    hasExisting={Boolean(d.latest)}
                    disabled={!canUpload}
                    disabledReason={uploadDisabledReason}
                  />
                </div>
              ))}
            </section>
          );
        })}
      </main>
    </>
  );
}
