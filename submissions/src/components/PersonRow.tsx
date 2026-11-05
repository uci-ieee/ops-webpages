"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPersonRole, setPersonSection } from "@/app/admin/people/actions";

export type SectionOption = { id: number; code: string; year: string };

type Props = {
  userId: string;
  ucinetid: string;
  name: string | null;
  role: string;
  status: string;
  currentSectionId: number | null;
  sections: SectionOption[];
  isSelf: boolean;
};

export function PersonRow(props: Props) {
  const router = useRouter();
  const [role, setRole] = useState(props.role);
  const [sectionId, setSectionId] = useState(
    props.currentSectionId === null ? "none" : String(props.currentSectionId),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const roleDirty = role !== props.role;
  const sectionDirty =
    sectionId !== (props.currentSectionId === null ? "none" : String(props.currentSectionId));

  const run = (fn: (fd: FormData) => Promise<{ ok: boolean } & Record<string, unknown>>, fd: FormData) => {
    setMessage(null);
    setError(null);
    start(async () => {
      const res = await fn(fd);
      if (res.ok) {
        setMessage(String(res.message ?? "Saved."));
        router.refresh();
      } else {
        setError(String(res.error ?? "That did not work."));
      }
    });
  };

  return (
    <tr>
      <td>
        <code>{props.ucinetid}</code>
        {props.isSelf ? <span className="self-tag">you</span> : null}
      </td>
      <td>{props.name ?? "—"}</td>
      <td>
        <span className={`pill ${props.status}`}>{props.status}</span>
      </td>
      <td>
        <div className="cell-form">
          <select value={role} onChange={(e) => setRole(e.target.value)} disabled={pending}>
            <option value="student">student</option>
            <option value="instructor">instructor</option>
            <option value="admin">admin</option>
          </select>
          {roleDirty ? (
            <button
              type="button"
              className="btn-quiet"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("userId", props.userId);
                fd.set("role", role);
                run(setPersonRole, fd);
              }}
            >
              Save
            </button>
          ) : null}
        </div>
      </td>
      <td>
        <div className="cell-form">
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            disabled={pending}
          >
            <option value="none">{"— none —"}</option>
            {props.sections.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.code}
              </option>
            ))}
          </select>
          {sectionDirty ? (
            <button
              type="button"
              className="btn-quiet"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("userId", props.userId);
                fd.set("sectionId", sectionId);
                run(setPersonSection, fd);
              }}
            >
              Save
            </button>
          ) : null}
        </div>
        {props.role !== "student" ? (
          <span className="hint">section they run</span>
        ) : null}
      </td>
      <td className="cell-feedback">
        {pending ? <span className="hint">saving&hellip;</span> : null}
        {message && !pending ? <span className="ok-text">{message}</span> : null}
        {error && !pending ? <span className="err-text">{error}</span> : null}
      </td>
    </tr>
  );
}
