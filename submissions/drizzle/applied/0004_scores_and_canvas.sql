-- Numeric scores, and a queue for pushing them to Canvas.

-- Each deliverable is worth some points. Managed from deliverable-spec.ts the
-- same way labels and size caps are, so changing a weighting is a code change
-- plus `npm run db:deliverables`, not a hand-edited row.
ALTER TABLE "deliverables" ADD COLUMN "points_possible" integer DEFAULT 10 NOT NULL;

-- Points awarded. Nullable: a verdict can exist without a score, which is what
-- every review recorded before this migration looks like.
ALTER TABLE "reviews" ADD COLUMN "score" integer;

-- The Canvas assignment a project maps to. One grade per assignment in Canvas,
-- so a project's score is the sum of its deliverables.
ALTER TABLE "projects" ADD COLUMN "canvas_assignment_id" integer;

CREATE TYPE "public"."canvas_sync_status" AS ENUM('pending', 'synced', 'failed', 'skipped');

/*
 * One row per student per project: the grade Canvas should hold.
 *
 * A queue rather than a direct call, because an instructor clicking Approve
 * must not fail or hang because Canvas is slow or down. The push is retried by
 * the cron sweep, and a stuck row is visible on the admin page instead of being
 * silently lost.
 *
 * Unique on (student, project) so re-reviewing updates the pending grade
 * instead of stacking duplicate pushes.
 */
CREATE TABLE "canvas_sync" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"project_id" integer NOT NULL,
	"score" integer NOT NULL,
	"points_possible" integer NOT NULL,
	"comment" text,
	"status" "canvas_sync_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"synced_at" timestamp with time zone
);

ALTER TABLE "canvas_sync"
  ADD CONSTRAINT "canvas_sync_student_id_users_id_fk"
  FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade;

ALTER TABLE "canvas_sync"
  ADD CONSTRAINT "canvas_sync_project_id_projects_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade;

CREATE UNIQUE INDEX "canvas_sync_student_project_key"
  ON "canvas_sync" USING btree ("student_id","project_id");

CREATE INDEX "canvas_sync_status_idx" ON "canvas_sync" USING btree ("status");
