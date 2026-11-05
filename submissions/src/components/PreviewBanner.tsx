import { stopPreview } from "@/app/admin/view-as/actions";
import type { User } from "@/lib/db/schema";

/**
 * Always visible while previewing. An admin must never be confused about whose
 * screen they are looking at, and nobody should be able to take an action
 * believing they are themselves.
 */
export function PreviewBanner({ actor, subject }: { actor: User; subject: User }) {
  return (
    <div className="preview-banner">
      <span>
        <strong>Read-only preview.</strong> Signed in as {actor.ucinetid}, viewing{" "}
        <strong>{subject.name ?? subject.ucinetid}</strong> ({subject.role}). Nothing you do here
        can change their work.
      </span>
      <form action={stopPreview}>
        <button className="btn ghost">Stop previewing</button>
      </form>
    </div>
  );
}
