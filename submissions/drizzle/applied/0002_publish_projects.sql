-- Projects are hidden from students until an admin publishes them.
-- Default false so a newly seeded project is never exposed by accident; the
-- seed/publish step decides what students can see.
ALTER TABLE "projects" ADD COLUMN "published" boolean DEFAULT false NOT NULL;

CREATE INDEX "projects_published_idx" ON "projects" USING btree ("published");
