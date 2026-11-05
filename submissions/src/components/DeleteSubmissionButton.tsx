"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteSubmission } from "@/app/submit/actions";

/**
 * Two-step confirm rather than a native confirm() dialog: deleting a submission
 * removes the file permanently, and a misclick should not be enough.
 */
export function DeleteSubmissionButton({
  submissionId,
  label = "Delete",
  what = "this submission",
  disabled,
}: {
  submissionId: string;
  label?: string;
  what?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (disabled) return null;

  if (!confirming) {
    return (
      <>
        <button type="button" className="btn-danger-link" onClick={() => setConfirming(true)}>
          {label}
        </button>
        {error ? (
          <span className="delete-error" role="alert">
            {error}
          </span>
        ) : null}
      </>
    );
  }

  return (
    <span className="confirm-row">
      <span className="confirm-text">Delete {what} permanently?</span>
      <button
        type="button"
        className="btn-danger"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const res = await deleteSubmission({ submissionId });
            if (!res.ok) {
              setError(res.error);
              setConfirming(false);
              return;
            }
            setConfirming(false);
            router.refresh();
          });
        }}
      >
        {pending ? "Deleting…" : "Yes, delete"}
      </button>
      <button
        type="button"
        className="btn-quiet"
        disabled={pending}
        onClick={() => setConfirming(false)}
      >
        Cancel
      </button>
    </span>
  );
}
