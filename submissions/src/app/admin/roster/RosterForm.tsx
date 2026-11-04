"use client";

import { useActionState } from "react";
import { clearDemoRoster, importRoster, type ImportState } from "./actions";

const PLACEHOLDER = `ucinetid,name,role,section_code,section_name
pantera,Peter Anteater,student,S01,Monday 5pm
zotzot,Zot Zotson,student,S01,Monday 5pm
mnguyen,Marvin Nguyen,instructor,S01,Monday 5pm`;

export function RosterForm({ defaultYear }: { defaultYear: string }) {
  const [state, submit, pending] = useActionState<ImportState | null, FormData>(
    importRoster,
    null,
  );
  const [clearState, clear, clearing] = useActionState<ImportState | null, FormData>(
    async () => clearDemoRoster(),
    null,
  );

  return (
    <>
      <form action={submit}>
        <label className="field">
          <span>Academic year</span>
          <input name="year" defaultValue={defaultYear} style={{ maxWidth: 160 }} />
        </label>

        <label className="field">
          <span>Paste the roster</span>
          <textarea name="roster" rows={14} placeholder={PLACEHOLDER} spellCheck={false} />
        </label>

        <button className="btn" disabled={pending}>
          {pending ? "Importing…" : "Import roster"}
        </button>
      </form>

      {state?.status === "error" ? (
        <div className="error" style={{ marginTop: 16 }}>
          <strong>Nothing was imported.</strong> Fix these and paste again:
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            {state.errors.slice(0, 25).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
          {state.errors.length > 25 ? <p style={{ margin: "8px 0 0" }}>…and {state.errors.length - 25} more.</p> : null}
        </div>
      ) : null}

      {state?.status === "done" ? (
        <div className="success" style={{ marginTop: 16 }}>
          <strong>Imported into {state.year}.</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
            <li>{state.result.usersCreated} people added</li>
            <li>{state.result.usersUpdated} already on the roster, details refreshed</li>
            <li>{state.result.sectionsTouched} sections created or updated</li>
            <li>{state.result.enrollments} student enrollments</li>
            <li>{state.result.instructorAssignments} instructor assignments</li>
          </ul>
        </div>
      ) : null}

      <div className="danger-zone">
        <strong>Remove the demo accounts</strong>
        <p className="sub" style={{ margin: "6px 0 10px", fontSize: 13 }}>
          Deletes the synthetic seed roster — <code>student001…</code>,{" "}
          <code>instructor01…</code>, <code>admin1…3</code> — and any section left empty. Only
          touches accounts that have never signed in, so it cannot remove a real person.
        </p>
        <form action={clear}>
          <button className="btn ghost" disabled={clearing}>
            {clearing ? "Removing…" : "Remove demo accounts"}
          </button>
        </form>
        {clearState?.status === "cleared" ? (
          <div className="success" style={{ marginTop: 12 }}>
            Removed {clearState.deleted} demo accounts and {clearState.sectionsRemoved} empty
            sections.
          </div>
        ) : null}
      </div>
    </>
  );
}
