"use client";

import { useActionState } from "react";
import { reviewSubmission, type ReviewResult } from "@/app/instructor/actions";

type Props = {
  submissionId: string;
  pointsPossible: number;
  current: { status: "approved" | "needs_work"; score: number | null; comment: string | null } | null;
  disabled?: boolean;
};

export function ReviewForm({ submissionId, pointsPossible, current, disabled }: Props) {
  const [state, submit, pending] = useActionState<ReviewResult | null, FormData>(
    reviewSubmission,
    null,
  );

  if (disabled) {
    return (
      <p className="empty" style={{ margin: "10px 0 0", fontSize: 13 }}>
        Read-only preview &mdash; reviewing is disabled.
      </p>
    );
  }

  return (
    <form action={submit} className="review-form">
      <input type="hidden" name="submissionId" value={submissionId} />

      <div className="score-row">
        <label className="score-field">
          <span>Score</span>
          <span className="score-input">
            <input
              name="score"
              type="number"
              min={0}
              max={pointsPossible}
              step={1}
              inputMode="numeric"
              placeholder="—"
              defaultValue={current?.score ?? ""}
            />
            <em>out of {pointsPossible}</em>
          </span>
        </label>
        <p className="hint" style={{ marginTop: 0 }}>
          Leave blank to record a verdict without a score. Scores for a project are added up and
          sent to its Canvas assignment.
        </p>
      </div>

      <textarea
        name="comment"
        rows={2}
        placeholder="Feedback for the student (optional)"
        defaultValue={current?.comment ?? ""}
      />

      <div className="review-actions">
        <button className="btn" name="status" value="approved" disabled={pending}>
          {pending ? "Saving…" : "Approve"}
        </button>
        <button className="btn ghost" name="status" value="needs_work" disabled={pending}>
          Needs work
        </button>
        {current ? (
          <span className="hint" style={{ marginTop: 0 }}>
            currently {current.status === "approved" ? "approved" : "needs work"}
            {current.score !== null ? `, ${current.score}/${pointsPossible}` : ", no score"}
          </span>
        ) : null}
      </div>

      {state && !state.ok ? (
        <div className="error" style={{ marginTop: 8, marginBottom: 0 }}>
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
