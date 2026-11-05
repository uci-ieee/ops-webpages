import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * S3-compatible object storage. Currently Cloudflare R2; the env var names are
 * deliberately provider-neutral so moving to Neon Object Storage, S3 or B2 is a
 * config change rather than a code change.
 *
 * Neon Object Storage would have been the natural fit, but it is only available
 * in us-east-1/us-east-2/eu-central-1/ap-southeast-1 and this project's
 * database lives in us-west-2.
 */

type Cache = { __opsS3?: S3Client };
const cache = globalThis as unknown as Cache;

function env(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `${name} is not set. Object storage needs S3_ENDPOINT, S3_ACCESS_KEY_ID, ` +
        `S3_SECRET_ACCESS_KEY and S3_BUCKET.`,
    );
  }
  return v;
}

export function bucket(): string {
  return env("S3_BUCKET");
}

/** Lazy, cached across hot reloads and warm serverless invocations. */
export function s3(): S3Client {
  if (cache.__opsS3) return cache.__opsS3;

  const client = new S3Client({
    endpoint: env("S3_ENDPOINT"),
    // R2 ignores the region, but the SDK requires one to sign requests.
    region: process.env.S3_REGION ?? "auto",
    credentials: {
      accessKeyId: env("S3_ACCESS_KEY_ID"),
      secretAccessKey: env("S3_SECRET_ACCESS_KEY"),
    },
    // Required: R2 and Neon both use path-style addressing.
    forcePathStyle: true,
  });

  cache.__opsS3 = client;
  return client;
}

/**
 * Object key layout. Keyed by student and deliverable, with the version in the
 * path so a resubmission never overwrites the file it replaces -- the old
 * object stays addressable until the purge job removes it deliberately.
 */
export function objectKey(args: {
  year: string;
  projectSlug: string;
  ucinetid: string;
  deliverableId: number;
  version: number;
  filename: string;
}): string {
  const ext = extensionOf(args.filename);
  return [
    args.year,
    args.projectSlug,
    args.ucinetid,
    `d${args.deliverableId}-v${args.version}${ext}`,
  ].join("/");
}

/** Lowercased extension including the dot, or "" when there is none. */
export function extensionOf(filename: string): string {
  const name = filename.toLowerCase();
  // KiCad uses multi-part extensions, so match the longest known one first.
  for (const special of [".kicad_pro", ".kicad_pcb", ".kicad_sch"]) {
    if (name.endsWith(special)) return special;
  }
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot);
}

/** Presigned PUT so the browser uploads straight to storage, not through us. */
export async function presignUpload(args: {
  key: string;
  contentType: string;
  expiresIn?: number;
}): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: args.key,
      ContentType: args.contentType,
    }),
    { expiresIn: args.expiresIn ?? 600 },
  );
}

/**
 * Presigned GET. `downloadAs` forces a download with a sensible filename
 * instead of inline playback -- used for superseded versions, which are
 * download-only on purpose.
 */
export async function presignDownload(args: {
  key: string;
  downloadAs?: string;
  expiresIn?: number;
}): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: args.key,
      ...(args.downloadAs
        ? { ResponseContentDisposition: `attachment; filename="${args.downloadAs.replace(/"/g, "")}"` }
        : {}),
    }),
    { expiresIn: args.expiresIn ?? 3600 },
  );
}

export type ObjectFacts = { bytes: number; contentType: string | undefined };

/** What is actually in storage, as opposed to what the browser claimed. */
export async function headObject(key: string): Promise<ObjectFacts | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { bytes: res.ContentLength ?? 0, contentType: res.ContentType };
  } catch {
    return null;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await s3().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/**
 * A presigned PUT cannot enforce a byte limit -- the signature covers the key
 * and content type, not the length. So after the browser finishes, the server
 * asks storage how big the object really is and deletes anything over cap.
 * Without this, the 25 MB limit is a suggestion.
 */
export async function verifyUploadedObject(args: {
  key: string;
  maxBytes: number;
}): Promise<{ ok: true; facts: ObjectFacts } | { ok: false; reason: string }> {
  const facts = await headObject(args.key);
  if (!facts) return { ok: false, reason: "The upload did not arrive. Try again." };

  if (facts.bytes === 0) {
    await deleteObject(args.key).catch(() => {});
    return { ok: false, reason: "That file was empty." };
  }

  if (facts.bytes > args.maxBytes) {
    await deleteObject(args.key).catch(() => {});
    return {
      ok: false,
      reason:
        `That file is ${formatBytes(facts.bytes)}, over the ${formatBytes(args.maxBytes)} limit. ` +
        `Record at a lower resolution or trim the clip.`,
    };
  }

  return { ok: true, facts };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
