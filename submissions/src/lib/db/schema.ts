import {
  bigint,
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const roleEnum = pgEnum("role", ["student", "instructor", "admin"]);
export const statusEnum = pgEnum("account_status", ["invited", "active", "disabled"]);

/**
 * The roster IS the user table. A row here is what lets someone sign in -- rows
 * are created by the admin roster import ("invited"), and the first successful
 * Google sign-in flips the row to "active" and fills in email/name. Nobody can
 * create an account by signing in, so there is no provisioning step and no
 * password to store anywhere.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ucinetid: text("ucinetid").notNull().unique(),
    email: text("email"),
    name: text("name"),
    role: roleEnum("role").notNull().default("student"),
    status: statusEnum("status").notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  },
  (t) => [index("users_role_idx").on(t.role)],
);

/** A lab section/cohort, scoped to an academic year (e.g. code "A", year "2026-2027"). */
export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    year: text("year").notNull(),
  },
  (t) => [uniqueIndex("sections_code_year_key").on(t.code, t.year)],
);

/** Which instructors run which sections. Many-to-many so co-instructors work. */
export const sectionInstructors = pgTable(
  "section_instructors",
  {
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    instructorId: uuid("instructor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.instructorId] }),
    index("section_instructors_instructor_idx").on(t.instructorId),
  ],
);

/** Which students sit in which section. This is the whole basis of scoping. */
export const enrollments = pgTable(
  "enrollments",
  {
    sectionId: integer("section_id")
      .notNull()
      .references(() => sections.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [
    primaryKey({ columns: [t.sectionId, t.studentId] }),
    index("enrollments_student_idx").on(t.studentId),
  ],
);

/**
 * What kind of file a deliverable expects. Drives the accepted extensions, the
 * size cap, and whether the browser offers a player or a download link.
 */
export const deliverableKindEnum = pgEnum("deliverable_kind", [
  "video",
  "photo",
  "sketch",
  "kicad",
  "archive",
]);

export const reviewStatusEnum = pgEnum("review_status", [
  "approved",
  "needs_work",
]);

/** One per OPS project, mirroring the project_*.html pages. */
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    title: text("title").notNull(),
    pageUrl: text("page_url"),
    position: integer("position").notNull(),
    year: text("year").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    /** The Canvas assignment this project maps to, if grades are pushed. */
    canvasAssignmentId: integer("canvas_assignment_id"),
    /**
     * Students see only published projects. Defaults to false so a newly
     * seeded project is never exposed before an officer is ready for it.
     */
    published: boolean("published").notNull().default(false),
  },
  (t) => [
    uniqueIndex("projects_slug_year_key").on(t.slug, t.year),
    index("projects_published_idx").on(t.published),
  ],
);

/**
 * A single required file within a project, transcribed from that project's
 * Deliverables section. Constraints live here rather than in code so they can
 * be corrected without a deploy.
 */
export const deliverables = pgTable(
  "deliverables",
  {
    id: serial("id").primaryKey(),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    kind: deliverableKindEnum("kind").notNull(),
    label: text("label").notNull(),
    instructions: text("instructions"),
    required: boolean("required").notNull().default(true),
    maxBytes: integer("max_bytes").notNull(),
    maxSeconds: integer("max_seconds"),
    allowedExtensions: text("allowed_extensions").array().notNull(),
    /**
     * Points this deliverable is worth. A project's Canvas grade is the sum of
     * these, since Canvas holds one grade per assignment rather than one per
     * file. Managed from deliverable-spec.ts like the other rules.
     */
    pointsPossible: integer("points_possible").notNull().default(10),
  },
  (t) => [uniqueIndex("deliverables_project_position_key").on(t.projectId, t.position)],
);

/**
 * One uploaded file. Rows are permanent; the *object* is not. When a student
 * resubmits, the previous row is marked superseded and its file becomes
 * eligible for deletion immediately -- storage stays flat across the year while
 * the submission history and any grade survive.
 */
export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    deliverableId: integer("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    storageKey: text("storage_key").notNull(),
    filename: text("filename").notNull(),
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    contentType: text("content_type").notNull(),
    durationSeconds: integer("duration_seconds"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    supersededAt: timestamp("superseded_at", { withTimezone: true }),
    /** When the stored object may be deleted. Null means "not yet scheduled". */
    purgeAfter: timestamp("purge_after", { withTimezone: true }),
    /** Set once the object is gone. The row stays, so history is never lost. */
    fileDeletedAt: timestamp("file_deleted_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("submissions_deliverable_student_version_key").on(
      t.deliverableId,
      t.studentId,
      t.version,
    ),
    index("submissions_student_idx").on(t.studentId),
    index("submissions_purge_idx").on(t.purgeAfter),
  ],
);

/**
 * Instructor feedback. Outlives both the stored file and the submission row.
 *
 * studentId and deliverableId are carried here rather than reached through the
 * submission, so a review still says who was assessed on what after its
 * submission is deleted. submissionId is nullable and set to null on delete
 * instead of cascading -- a grade must never disappear because someone removed
 * the video it was about.
 */
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    submissionId: uuid("submission_id").references(() => submissions.id, {
      onDelete: "set null",
    }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    deliverableId: integer("deliverable_id")
      .notNull()
      .references(() => deliverables.id, { onDelete: "cascade" }),
    reviewerId: uuid("reviewer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: reviewStatusEnum("status").notNull(),
    /** Points awarded. Null for verdicts recorded before scoring existed. */
    score: integer("score"),
    comment: text("comment"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("reviews_submission_idx").on(t.submissionId),
    index("reviews_student_idx").on(t.studentId),
  ],
);

export const canvasSyncStatusEnum = pgEnum("canvas_sync_status", [
  "pending",
  "synced",
  "failed",
  "skipped",
]);

/**
 * The grade Canvas should hold for one student on one project.
 *
 * A queue rather than a direct call: an instructor clicking Approve must not
 * fail or hang because Canvas is slow. The cron sweep drains it and retries,
 * and anything stuck shows up on the admin page rather than vanishing.
 *
 * Unique on (student, project) so re-reviewing updates the pending grade
 * instead of stacking duplicate pushes.
 */
export const canvasSync = pgTable(
  "canvas_sync",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    projectId: integer("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    score: integer("score").notNull(),
    pointsPossible: integer("points_possible").notNull(),
    comment: text("comment"),
    status: canvasSyncStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    queuedAt: timestamp("queued_at", { withTimezone: true }).notNull().defaultNow(),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("canvas_sync_student_project_key").on(t.studentId, t.projectId),
    index("canvas_sync_status_idx").on(t.status),
  ],
);

export type User = typeof users.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
export type Project = typeof projects.$inferSelect;
export type Deliverable = typeof deliverables.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type DeliverableKind = (typeof deliverableKindEnum.enumValues)[number];
