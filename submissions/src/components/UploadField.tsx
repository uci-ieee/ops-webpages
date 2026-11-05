"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { confirmUpload, requestUpload } from "@/app/submit/actions";
import { compressVideo } from "@/lib/compress-video";

type Props = {
  deliverableId: number;
  kind: string;
  maxBytes: number;
  maxSeconds: number | null;
  allowedExtensions: string[];
  hasExisting: boolean;
  disabled?: boolean;
  disabledReason?: string;
};

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Reads the duration without uploading anything, so an over-long clip is
 * rejected before either compression or a 50 MB transfer.
 */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      const d = el.duration;
      done(Number.isFinite(d) && d > 0 ? d : null);
    };
    el.onerror = () => done(null);
    el.src = url;
    // Some containers never fire metadata in some browsers; don't hang.
    setTimeout(() => done(null), 8000);
  });
}

/** XHR rather than fetch, purely to get upload progress. */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (pct: number) => void,
): Promise<{ ok: boolean; status: number }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status });
    xhr.onerror = () => resolve({ ok: false, status: 0 });
    xhr.send(file);
  });
}

export function UploadField(props: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function handle(file: File) {
    setError(null);
    setNote(null);
    setBusy(true);
    setPct(0);

    try {
      // An over-long clip is rejected first: no point compressing it.
      let duration: number | null = null;
      if (props.maxSeconds !== null) {
        setStage("Checking length…");
        duration = await readDuration(file);
        if (duration !== null && duration > props.maxSeconds + 1) {
          setError(
            `That video is ${Math.round(duration)}s, over the ${props.maxSeconds}s limit. Trim it and try again.`,
          );
          return;
        }
      }

      // Sanity bound so a pathological file is not fed to the encoder.
      if (file.size > props.maxBytes * 8) {
        setError(
          `That file is ${fmt(file.size)}, far past the ${fmt(props.maxBytes)} limit. ` +
            `Re-record at a lower resolution (720p) and try again.`,
        );
        return;
      }

      // Compression is best-effort: any failure falls back to the original.
      let working = file;
      if (props.kind === "video") {
        setStage("Compressing to 720p…");
        setPct(0);
        const result = await compressVideo(file, setPct);
        working = result.file;
        if (result.skippedReason) {
          // Not an error -- just explains why the file was left alone.
          setNote(`Uploaded as-is (${result.skippedReason}).`);
        } else {
          setNote(
            `Compressed ${fmt(result.originalBytes)} → ${fmt(result.compressedBytes)} at 720p.`,
          );
        }
      }

      // Checked after compression, so a big 4K clip gets rescued rather than
      // rejected outright.
      if (working.size > props.maxBytes) {
        setError(
          `Even after compressing, that file is ${fmt(working.size)}, over the ${fmt(props.maxBytes)} limit. ` +
            `Try a shorter clip, or re-record at 720p.`,
        );
        return;
      }

      setStage("Preparing…");
      setPct(0);
      const ticket = await requestUpload({
        deliverableId: props.deliverableId,
        filename: working.name,
        contentType: working.type || "application/octet-stream",
        size: working.size,
        durationSeconds: duration,
      });
      if (!ticket.ok) {
        setError(ticket.error);
        return;
      }

      setStage("Uploading…");
      const put = await putWithProgress(ticket.url, working, setPct);
      if (!put.ok) {
        setError(
          put.status === 0
            ? "The upload was blocked before it left your browser. If this keeps happening, tell an OPS officer -- the storage bucket may be missing its CORS policy."
            : `The upload was rejected (HTTP ${put.status}). Try again.`,
        );
        return;
      }

      setStage("Finishing…");
      const confirmed = await confirmUpload({
        deliverableId: props.deliverableId,
        version: ticket.version,
        filename: working.name,
        contentType: working.type || "application/octet-stream",
        durationSeconds: duration,
      });
      if (!confirmed.ok) {
        setError(confirmed.error);
        return;
      }

      if (input.current) input.current.value = "";
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
      setStage("");
      setPct(0);
    }
  }

  if (props.disabled) {
    return (
      <p className="empty" style={{ margin: "8px 0 0" }}>
        {props.disabledReason ?? "Uploading is disabled here."}
      </p>
    );
  }

  return (
    <div style={{ marginTop: 10 }}>
      <input
        ref={input}
        type="file"
        accept={props.allowedExtensions.join(",")}
        disabled={busy}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handle(f);
        }}
      />
      {busy ? (
        <div style={{ marginTop: 8 }}>
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="sub" style={{ margin: "6px 0 0", fontSize: 13 }}>
            {stage} {pct > 0 && pct < 100 ? `${pct}%` : ""}
            {stage.startsWith("Compressing")
              ? " — this runs in real time, so roughly the length of the clip."
              : ""}
          </p>
        </div>
      ) : null}
      {error ? (
        <div className="error" style={{ marginTop: 8 }}>
          {error}
        </div>
      ) : null}
      {note && !error ? (
        <p className="sub" style={{ margin: "6px 0 0", fontSize: 12 }}>
          {note}
        </p>
      ) : null}
      {!busy && !error ? (
        <p className="sub" style={{ margin: "6px 0 0", fontSize: 12 }}>
          {props.allowedExtensions.join(", ")} &middot; up to {fmt(props.maxBytes)}
          {props.maxSeconds !== null ? ` · max ${props.maxSeconds}s` : ""}
          {props.kind === "video" ? " · compressed to 720p automatically" : ""}
          {props.hasExisting ? " · uploading replaces your current file" : ""}
        </p>
      ) : null}
    </div>
  );
}
