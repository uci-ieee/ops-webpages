/**
 * Syncs the project/deliverable definitions from `deliverable-spec.ts` into the
 * database. Safe to re-run: everything is matched on (slug, year) and
 * (project, position) and updated in place.
 *
 * It never deletes a deliverable that already has submissions attached --
 * deleting one would cascade and take real student work with it. Extras are
 * reported for a human to resolve instead.
 *
 *   npm run db:deliverables
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

// One-off admin script: the direct endpoint, not the pooler. Must be set before
// getDb() first reads DATABASE_URL.
if (process.env.DATABASE_URL_UNPOOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_UNPOOLED;
}

async function main() {
  const { and, eq, gte, inArray } = await import("drizzle-orm");
  const { getDb } = await import("./index");
  const { deliverables, projects, submissions } = await import("./schema");
  const { PROJECT_SPEC, resolveRules } = await import("../deliverable-spec");
  const { CURRENT_YEAR } = await import("../roster");

  const db = getDb();
  let projectCount = 0;
  let deliverableCount = 0;
  const warnings: string[] = [];

  for (const [index, spec] of PROJECT_SPEC.entries()) {
    const [project] = await db
      .insert(projects)
      .values({
        slug: spec.slug,
        label: spec.label,
        title: spec.title,
        pageUrl: spec.pageUrl,
        position: index + 1,
        year: CURRENT_YEAR,
      })
      .onConflictDoUpdate({
        target: [projects.slug, projects.year],
        set: {
          label: spec.label,
          title: spec.title,
          pageUrl: spec.pageUrl,
          position: index + 1,
        },
      })
      .returning({ id: projects.id });

    const projectId = project!.id;
    projectCount++;

    for (const [i, d] of spec.deliverables.entries()) {
      const rules = resolveRules(d);
      await db
        .insert(deliverables)
        .values({
          projectId,
          position: i + 1,
          kind: d.kind,
          label: d.label,
          instructions: d.instructions ?? null,
          maxBytes: rules.maxBytes,
          maxSeconds: rules.maxSeconds,
          allowedExtensions: rules.allowedExtensions,
        })
        .onConflictDoUpdate({
          target: [deliverables.projectId, deliverables.position],
          set: {
            kind: d.kind,
            label: d.label,
            instructions: d.instructions ?? null,
            maxBytes: rules.maxBytes,
            maxSeconds: rules.maxSeconds,
            allowedExtensions: rules.allowedExtensions,
          },
        });
      deliverableCount++;
    }

    // Anything left past the end of the spec is stale.
    const extras = await db
      .select({ id: deliverables.id, label: deliverables.label })
      .from(deliverables)
      .where(
        and(eq(deliverables.projectId, projectId), gte(deliverables.position, spec.deliverables.length + 1)),
      );

    if (extras.length > 0) {
      const extraIds = extras.map((e) => e.id);
      const used = await db
        .select({ deliverableId: submissions.deliverableId })
        .from(submissions)
        .where(inArray(submissions.deliverableId, extraIds));
      const usedIds = new Set(used.map((u) => u.deliverableId));

      const safeToDrop = extras.filter((e) => !usedIds.has(e.id));
      const keep = extras.filter((e) => usedIds.has(e.id));

      if (safeToDrop.length > 0) {
        await db.delete(deliverables).where(
          inArray(
            deliverables.id,
            safeToDrop.map((e) => e.id),
          ),
        );
        warnings.push(
          `${spec.slug}: removed ${safeToDrop.length} stale deliverable(s) with no submissions`,
        );
      }
      for (const k of keep) {
        warnings.push(
          `${spec.slug}: "${k.label}" is no longer in the spec but HAS submissions -- left in place, resolve by hand`,
        );
      }
    }
  }

  console.log(`projects synced    : ${projectCount}`);
  console.log(`deliverables synced: ${deliverableCount}`);

  const byKind = await db.select({ kind: deliverables.kind }).from(deliverables);
  const tally = byKind.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});
  console.log("by kind            :", tally);

  if (warnings.length) {
    console.log("\nwarnings:");
    for (const w of warnings) console.log("  " + w);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
