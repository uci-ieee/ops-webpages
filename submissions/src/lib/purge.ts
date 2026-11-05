import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { getDb } from "./db";
import { submissions } from "./db/schema";
import { bucket, deleteObject, s3 } from "./storage";

/**
 * Deletes stored files that are past their retention date, and sweeps objects
 * that no submission points at.
 *
 * Rows are never removed here -- only the file. file_deleted_at records that
 * the object is gone while the submission and its review stay on record, which
 * is what keeps storage flat without losing the history of what a student did.
 *
 * Two things are collected:
 *
 *  1. Expired files: purge_after has passed and the file is still present.
 *     purge_after is set to a short window when a submission is superseded, 30
 *     days when it is reviewed, and a long backstop otherwise.
 *
 *  2. Orphans: objects in the bucket that no submission row references. These
 *     happen when a browser finishes a presigned PUT and then never confirms
 *     (tab closed, connection dropped). They are invisible to the quota, which
 *     counts rows, so nothing else would ever find them.
 */

/** Orphans younger than this are left alone: an upload may still be in flight. */
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export type PurgeReport = {
  dryRun: boolean;
  expired: { considered: number; filesDeleted: number; bytesFreed: number; failures: number };
  orphans: { found: number; deleted: number; bytesFreed: number; skippedTooNew: number };
  errors: string[];
};

export async function runPurge(opts: { dryRun?: boolean } = {}): Promise<PurgeReport> {
  const dryRun = opts.dryRun ?? false;
  const db = getDb();
  const errors: string[] = [];

  const report: PurgeReport = {
    dryRun,
    expired: { considered: 0, filesDeleted: 0, bytesFreed: 0, failures: 0 },
    orphans: { found: 0, deleted: 0, bytesFreed: 0, skippedTooNew: 0 },
    errors,
  };

  // ---- 1. Files past their retention date ----
  const due = await db
    .select({
      id: submissions.id,
      storageKey: submissions.storageKey,
      bytes: submissions.bytes,
    })
    .from(submissions)
    .where(
      and(
        isNotNull(submissions.purgeAfter),
        lte(submissions.purgeAfter, new Date()),
        isNull(submissions.fileDeletedAt),
      ),
    );

  report.expired.considered = due.length;

  for (const row of due) {
    if (dryRun) {
      report.expired.bytesFreed += row.bytes;
      continue;
    }
    try {
      await deleteObject(row.storageKey);
      // Mark it gone only after the object is actually removed, so a failure
      // here means it is retried on the next run rather than being recorded as
      // deleted while still costing money. Scoped to this row specifically.
      await db
        .update(submissions)
        .set({ fileDeletedAt: new Date() })
        .where(eq(submissions.id, row.id));
      report.expired.filesDeleted++;
      report.expired.bytesFreed += row.bytes;
    } catch (e) {
      report.expired.failures++;
      errors.push(
        `expired ${row.storageKey}: ${e instanceof Error ? e.message : "delete failed"}`,
      );
    }
  }

  // ---- 2. Objects nothing points at ----
  try {
    const known = new Set(
      (await db.select({ key: submissions.storageKey }).from(submissions)).map((r) => r.key),
    );

    const cutoff = Date.now() - ORPHAN_GRACE_MS;
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

      for (const obj of res.Contents ?? []) {
        const key = obj.Key;
        if (!key || known.has(key)) continue;

        report.orphans.found++;

        const modified = obj.LastModified ? obj.LastModified.getTime() : 0;
        if (modified > cutoff) {
          report.orphans.skippedTooNew++;
          continue;
        }

        if (dryRun) {
          report.orphans.bytesFreed += obj.Size ?? 0;
          continue;
        }

        try {
          await deleteObject(key);
          report.orphans.deleted++;
          report.orphans.bytesFreed += obj.Size ?? 0;
        } catch (e) {
          errors.push(`orphan ${key}: ${e instanceof Error ? e.message : "delete failed"}`);
        }
      }

      token = res.IsTruncated ? res.NextContinuationToken : undefined;
      pages++;
    } while (token && pages < 50);
  } catch (e) {
    errors.push(`orphan sweep: ${e instanceof Error ? e.message : "could not list storage"}`);
  }

  return report;
}

/**
 * How many files are due for deletion right now. A cheap count for the admin
 * page -- unlike runPurge in dry-run mode, it does not list the bucket.
 */
export async function pendingPurgeCount(): Promise<{ files: number; bytes: number }> {
  const rows = await getDb()
    .select({ bytes: submissions.bytes })
    .from(submissions)
    .where(
      and(
        isNotNull(submissions.purgeAfter),
        lte(submissions.purgeAfter, new Date()),
        isNull(submissions.fileDeletedAt),
      ),
    );
  return { files: rows.length, bytes: rows.reduce((n, r) => n + r.bytes, 0) };
}
