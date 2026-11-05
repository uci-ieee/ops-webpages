import { isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { submissions } from "./db/schema";
import { bucket, s3 } from "./storage";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";

const GB = 1024 * 1024 * 1024;

/**
 * Hard ceiling on stored files. Cloudflare R2 includes 10 GB free, so the
 * default stops at 9 GB -- leaving headroom rather than discovering the limit
 * by being billed for it.
 *
 * Override with STORAGE_QUOTA_BYTES (e.g. if the club decides to pay for more).
 */
export function quotaBytes(): number {
  const raw = process.env.STORAGE_QUOTA_BYTES;
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 9 * GB;
}

/**
 * Bytes currently held, from the database rather than from storage: it is one
 * indexed aggregate instead of paging through every object, which matters when
 * this runs on the critical path of every upload request.
 *
 * Rows whose file has been purged are excluded, since those bytes are gone.
 */
export async function recordedUsage(): Promise<number> {
  const rows = await getDb()
    .select({ total: sql<string | null>`sum(${submissions.bytes})` })
    .from(submissions)
    .where(isNull(submissions.fileDeletedAt));
  return Number(rows[0]?.total ?? 0);
}

export type QuotaStatus = {
  usedBytes: number;
  quotaBytes: number;
  percent: number;
  /** True when no further student uploads are permitted. */
  blocked: boolean;
  /** True past 80% -- worth warning admins before it bites. */
  warning: boolean;
};

export async function quotaStatus(): Promise<QuotaStatus> {
  const used = await recordedUsage();
  const limit = quotaBytes();
  const percent = limit > 0 ? (used / limit) * 100 : 0;
  return {
    usedBytes: used,
    quotaBytes: limit,
    percent,
    blocked: used >= limit,
    warning: percent >= 80,
  };
}

/**
 * The gate. Checked before a presigned URL is handed out, with the incoming
 * file's size included, so an upload that *would* cross the line is refused
 * rather than accepted and then discovered.
 */
export async function checkQuotaFor(
  incomingBytes: number,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const status = await quotaStatus();

  if (status.blocked) {
    return {
      ok: false,
      reason:
        "Submissions are paused: OPS has hit its file storage limit. " +
        "This is not your fault and nothing you have already submitted is affected. " +
        "Tell an OPS officer -- they need to free up space before anyone can upload again.",
    };
  }

  if (status.usedBytes + incomingBytes > status.quotaBytes) {
    return {
      ok: false,
      reason:
        "That file would put OPS over its storage limit, so it was not accepted. " +
        "Tell an OPS officer. Submitting a smaller file may work in the meantime.",
    };
  }

  return { ok: true };
}

/**
 * What storage actually holds, by listing the bucket. Slower than
 * recordedUsage() and paginated, so it is for the admin screen only -- never
 * the upload path.
 *
 * Worth having because the two can legitimately diverge: a browser can complete
 * a presigned PUT and then fail to confirm, leaving an object with no row. Those
 * orphans cost money and are invisible to recordedUsage().
 */
export async function measuredUsage(): Promise<{
  bytes: number;
  objects: number;
  truncated: boolean;
}> {
  let bytes = 0;
  let objects = 0;
  let token: string | undefined;
  let pages = 0;

  do {
    const res = await s3().send(
      new ListObjectsV2Command({
        Bucket: bucket(),
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const o of res.Contents ?? []) {
      bytes += o.Size ?? 0;
      objects++;
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
    pages++;
    // Don't let an unexpectedly huge bucket hang the admin page.
  } while (token && pages < 20);

  return { bytes, objects, truncated: Boolean(token) };
}

export function formatGB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < GB) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / GB).toFixed(2)} GB`;
}
