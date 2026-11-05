/**
 * Best-effort video compression in the browser, before upload.
 *
 * Why in the browser: transcoding server-side would mean pulling the file back
 * out of storage, running ffmpeg inside a serverless execution limit, and
 * re-uploading -- doubling egress and usually timing out on a 50 MB clip.
 *
 * Why MediaRecorder rather than ffmpeg.wasm: no 25 MB WebAssembly download, no
 * COOP/COEP headers, and it works on the phones students actually use. The cost
 * is that it runs in real time, so a 60-second clip takes about 60 seconds.
 *
 * This is ALWAYS best-effort. Every failure path returns the original file, so
 * a student can never be blocked from submitting because a transcoder broke.
 */

const TARGET_HEIGHT = 720;
const VIDEO_BITRATE = 1_500_000; // ~1.5 Mbps: comfortable for 720p screen capture
const AUDIO_BITRATE = 96_000;

export type CompressOutcome = {
  file: File;
  originalBytes: number;
  compressedBytes: number;
  /** Null when compression actually ran; otherwise why it did not. */
  skippedReason: string | null;
};

type MaybeWebkitWindow = typeof window & { webkitAudioContext?: typeof AudioContext };
type FrameCallbackVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: () => void) => number;
};

/** First container the browser will actually encode. Order matters. */
function pickMimeType(): { mime: string; ext: string } | null {
  const candidates: { mime: string; ext: string }[] = [
    // Safari can emit MP4 directly, which keeps the familiar extension.
    { mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: ".mp4" },
    { mime: "video/mp4", ext: ".mp4" },
    { mime: "video/webm;codecs=vp9,opus", ext: ".webm" },
    { mime: "video/webm;codecs=vp8,opus", ext: ".webm" },
    { mime: "video/webm", ext: ".webm" },
  ];
  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mime)) return c;
  }
  return null;
}

function supported(): string | null {
  if (typeof window === "undefined") return "not in a browser";
  if (typeof MediaRecorder === "undefined") return "this browser cannot re-encode video";
  if (typeof HTMLCanvasElement === "undefined") return "no canvas support";
  if (!HTMLCanvasElement.prototype.captureStream) return "this browser cannot capture a canvas";
  if (!pickMimeType()) return "no supported output format";
  return null;
}

/**
 * Re-encode to 720p, preserving audio.
 *
 * Audio goes through an AudioContext rather than HTMLMediaElement.captureStream,
 * which Safari does not implement. Routing through a MediaStreamDestination and
 * never connecting to ctx.destination also means playback stays silent to the
 * student while still being captured.
 */
export async function compressVideo(
  file: File,
  onProgress?: (percent: number) => void,
): Promise<CompressOutcome> {
  const originalBytes = file.size;
  const bail = (reason: string): CompressOutcome => ({
    file,
    originalBytes,
    compressedBytes: originalBytes,
    skippedReason: reason,
  });

  const unsupported = supported();
  if (unsupported) return bail(unsupported);

  const target = pickMimeType()!;
  const url = URL.createObjectURL(file);
  const video = document.createElement("video") as FrameCallbackVideo;
  let audioCtx: AudioContext | null = null;
  let recorder: MediaRecorder | null = null;

  const cleanup = () => {
    try {
      recorder?.state !== "inactive" && recorder?.stop();
    } catch {
      /* already stopped */
    }
    video.pause();
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
    void audioCtx?.close().catch(() => {});
  };

  try {
    video.src = url;
    video.playsInline = true;
    video.preload = "auto";

    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error("could not read that video"));
      setTimeout(() => reject(new Error("timed out reading the video")), 15_000);
    });

    const srcW = video.videoWidth;
    const srcH = video.videoHeight;
    if (!srcW || !srcH) {
      cleanup();
      return bail("could not determine the video size");
    }

    // Never upscale: a 480p clip stays 480p.
    if (srcH <= TARGET_HEIGHT) {
      cleanup();
      return bail("already 720p or smaller");
    }

    const scale = TARGET_HEIGHT / srcH;
    // Even dimensions: some encoders reject odd widths.
    const outW = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const outH = Math.max(2, Math.round(TARGET_HEIGHT / 2) * 2);

    const canvas = document.createElement("canvas");
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) {
      cleanup();
      return bail("could not get a drawing context");
    }

    const canvasStream = canvas.captureStream(30);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

    // Audio, if the clip has any. Failure here must not lose the video.
    try {
      const Ctor =
        window.AudioContext ?? (window as MaybeWebkitWindow).webkitAudioContext ?? null;
      if (Ctor) {
        audioCtx = new Ctor();
        if (audioCtx.state === "suspended") await audioCtx.resume();
        const source = audioCtx.createMediaElementSource(video);
        const dest = audioCtx.createMediaStreamDestination();
        source.connect(dest);
        // Deliberately NOT connected to audioCtx.destination, so the student
        // does not hear the clip replay while it is being processed.
        for (const t of dest.stream.getAudioTracks()) tracks.push(t);
      }
    } catch {
      /* no audio captured; video still compresses */
    }

    const stream = new MediaStream(tracks);
    recorder = new MediaRecorder(stream, {
      mimeType: target.mime,
      videoBitsPerSecond: VIDEO_BITRATE,
      audioBitsPerSecond: AUDIO_BITRATE,
    });

    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };

    const finished = new Promise<void>((resolve, reject) => {
      recorder!.onstop = () => resolve();
      recorder!.onerror = () => reject(new Error("the encoder failed"));
    });

    recorder.start(1000);

    const draw = () => {
      try {
        ctx.drawImage(video, 0, 0, outW, outH);
      } catch {
        /* a frame we cannot draw is not fatal */
      }
      if (video.duration > 0) {
        onProgress?.(Math.min(99, Math.round((video.currentTime / video.duration) * 100)));
      }
      if (!video.ended && !video.paused) schedule();
    };
    const schedule = () => {
      if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(draw);
      else requestAnimationFrame(draw);
    };

    const playback = new Promise<void>((resolve, reject) => {
      video.onended = () => resolve();
      video.onerror = () => reject(new Error("playback failed"));
    });

    await video.play();
    schedule();

    // Real-time encode, so allow the clip's length plus slack, then give up
    // rather than hanging the form forever.
    const budgetMs = Math.max(20_000, (video.duration + 20) * 1000 * 1.5);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("compression took too long")), budgetMs),
    );

    await Promise.race([playback, timeout]);

    recorder.stop();
    await Promise.race([finished, timeout]);

    const blob = new Blob(chunks, { type: target.mime.split(";")[0] });
    cleanup();

    if (blob.size === 0) return bail("the encoder produced nothing");

    // If re-encoding did not help, keep the original.
    if (blob.size >= originalBytes) return bail("compression did not reduce the size");

    const base = file.name.replace(/\.[^.]+$/, "");
    const out = new File([blob], `${base}-720p${target.ext}`, {
      type: target.mime.split(";")[0],
    });

    onProgress?.(100);
    return {
      file: out,
      originalBytes,
      compressedBytes: out.size,
      skippedReason: null,
    };
  } catch (e) {
    cleanup();
    return bail(e instanceof Error ? e.message : "compression failed");
  }
}
