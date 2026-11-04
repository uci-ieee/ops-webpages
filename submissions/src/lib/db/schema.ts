import {
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

export type User = typeof users.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Role = (typeof roleEnum.enumValues)[number];
