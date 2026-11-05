"use client";

import { useActionState } from "react";
import { reviewSubmission, type ReviewResult } from "@/app/instructor/actions";

type Props = {
  submissionId: string;
  current: { status: "approved" | "needs_work"; comment: string | null } | null;
  disabled?: boolean;
};

export function ReviewForm({ submissionId, current, disabled }: Props) {
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
      <textarea
        name="comment"
        rows={2}
        placeholder="Feedback for the student (optional)"
        defaultValue={current?.comment ?? ""}
      />
      <div className="review-actions">
        <button
          className="btn"
          name="status"
          value="approved"
          disabled={pending}
          formNoValidate
        >
          {pending ? "Saving…" : "Approve"}
        </button>
        <button className="btn ghost" name="status" value="needs_work" disabled={pending}>
          Needs work
        </button>
        {current ? (
          <span className="sub" style={{ fontSize: 12 }}>
            currently {current.status === "approved" ? "approved" : "needs work"}
          </span>
        ) : null}
      </div>
      {state && !state.ok ? (
        <div className="error" style={{ marginTop: 8 }}>
          {state.error}
        </div>
      ) : null}
    </form>
  );
}
