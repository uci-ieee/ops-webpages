-- Additive only. Creates the four new submission tables, their two enums,
-- foreign keys and indexes. Touches nothing that already exists: users,
-- sections, enrollments, section_instructors and their enums are left alone.

CREATE TYPE "public"."deliverable_kind" AS ENUM('video', 'photo', 'sketch', 'kicad', 'archive');

CREATE TYPE "public"."review_status" AS ENUM('approved', 'needs_work');

CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"label" text NOT NULL,
	"title" text NOT NULL,
	"page_url" text,
	"position" integer NOT NULL,
	"year" text NOT NULL,
	"due_at" timestamp with time zone
);

CREATE TABLE "deliverables" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"position" integer NOT NULL,
	"kind" "deliverable_kind" NOT NULL,
	"label" text NOT NULL,
	"instructions" text,
	"required" boolean DEFAULT true NOT NULL,
	"max_bytes" integer NOT NULL,
	"max_seconds" integer,
	"allowed_extensions" text[] NOT NULL
);

CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"deliverable_id" integer NOT NULL,
	"student_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"storage_key" text NOT NULL,
	"filename" text NOT NULL,
	"bytes" bigint NOT NULL,
	"content_type" text NOT NULL,
	"duration_seconds" integer,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"purge_after" timestamp with time zone,
	"file_deleted_at" timestamp with time zone
);

CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"reviewer_id" uuid NOT NULL,
	"status" "review_status" NOT NULL,
	"comment" text,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "submissions" ADD CONSTRAINT "submissions_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "projects_slug_year_key" ON "projects" USING btree ("slug","year");

CREATE UNIQUE INDEX "deliverables_project_position_key" ON "deliverables" USING btree ("project_id","position");

CREATE UNIQUE INDEX "submissions_deliverable_student_version_key" ON "submissions" USING btree ("deliverable_id","student_id","version");

CREATE INDEX "submissions_student_idx" ON "submissions" USING btree ("student_id");

CREATE INDEX "submissions_purge_idx" ON "submissions" USING btree ("purge_after");

CREATE INDEX "reviews_submission_idx" ON "reviews" USING btree ("submission_id");
