-- A review used to cascade away with its submission, so deleting a submission
-- silently destroyed the grade attached to it -- and a student could trigger
-- that on their own approved work.
--
-- Reviews now carry enough context to stand alone (which student, which
-- deliverable) and keep existing when the submission goes.

ALTER TABLE "reviews" ADD COLUMN "student_id" uuid;
ALTER TABLE "reviews" ADD COLUMN "deliverable_id" integer;

-- Backfill from the submission each review currently points at.
UPDATE "reviews" r
SET "student_id" = s."student_id",
    "deliverable_id" = s."deliverable_id"
FROM "submissions" s
WHERE s."id" = r."submission_id";

-- Any review with no resolvable submission cannot be given context; there
-- should be none, and this will fail loudly rather than inventing data.
ALTER TABLE "reviews" ALTER COLUMN "student_id" SET NOT NULL;
ALTER TABLE "reviews" ALTER COLUMN "deliverable_id" SET NOT NULL;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_student_id_users_id_fk"
  FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade;

ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_deliverable_id_deliverables_id_fk"
  FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE cascade;

-- The link to the submission becomes optional, and no longer cascades.
ALTER TABLE "reviews" ALTER COLUMN "submission_id" DROP NOT NULL;
ALTER TABLE "reviews" DROP CONSTRAINT "reviews_submission_id_submissions_id_fk";
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_submission_id_submissions_id_fk"
  FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE SET NULL;

CREATE INDEX "reviews_student_idx" ON "reviews" USING btree ("student_id");
