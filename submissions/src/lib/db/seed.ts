/**
 * Loads a roster so every screen has something real to show.
 *
 * Reads `submissions/roster.csv` if it exists, otherwise synthesizes a roster at
 * the size OPS actually runs at (135 students, 12 instructors, 3 admins,
 * 12 sections) so the dashboards can be judged at real scale.
 *
 * CSV columns (header row required, extra columns ignored):
 *   ucinetid,name,role,section_code,section_name
 *
 * Safe to re-run: every write is an upsert.
 */

import { config as loadEnv } from "dotenv";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "./index";
import { enrollments, sectionInstructors, sections, users } from "./schema";
import type { Role } from "./schema";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

const YEAR = "2026-2027";

type RosterRow = {
  ucinetid: string;
  name: string;
  role: Role;
  sectionCode: string | null;
  sectionName: string | null;
};

function parseCsv(path: string): RosterRow[] {
  const lines = readFileSync(path, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = lines[0]!.split(",").map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.indexOf(name);

  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim());
    const role = (cells[idx("role")] || "student").toLowerCase();
    return {
      ucinetid: cells[idx("ucinetid")]!.toLowerCase(),
      name: cells[idx("name")] || cells[idx("ucinetid")]!,
      role: (["student", "instructor", "admin"].includes(role) ? role : "student") as Role,
      sectionCode: idx("section_code") >= 0 ? cells[idx("section_code")] || null : null,
      sectionName: idx("section_name") >= 0 ? cells[idx("section_name")] || null : null,
    };
  });
}

function demoRoster(): RosterRow[] {
  const SECTION_COUNT = 12;
  const STUDENT_COUNT = 135;
  const rows: RosterRow[] = [];

  const code = (i: number) => `S${String(i + 1).padStart(2, "0")}`;
  const sectionName = (i: number) => `Lab Section ${code(i)}`;

  for (let i = 0; i < SECTION_COUNT; i++) {
    rows.push({
      ucinetid: `instructor${String(i + 1).padStart(2, "0")}`,
      name: `Instructor ${i + 1}`,
      role: "instructor",
      sectionCode: code(i),
      sectionName: sectionName(i),
    });
  }

  for (let i = 0; i < 3; i++) {
    rows.push({
      ucinetid: `admin${i + 1}`,
      name: `Admin ${i + 1}`,
      role: "admin",
      sectionCode: null,
      sectionName: null,
    });
  }

  // Round-robin so section sizes differ by at most one, like real enrollment.
  for (let i = 0; i < STUDENT_COUNT; i++) {
    const s = i % SECTION_COUNT;
    rows.push({
      ucinetid: `student${String(i + 1).padStart(3, "0")}`,
      name: `Student ${i + 1}`,
      role: "student",
      sectionCode: code(s),
      sectionName: sectionName(s),
    });
  }

  return rows;
}

async function main() {
  const csvPath = resolve(process.cwd(), "roster.csv");
  const fromCsv = existsSync(csvPath);
  const roster = fromCsv ? parseCsv(csvPath) : demoRoster();

  console.log(
    fromCsv
      ? `Seeding from roster.csv (${roster.length} rows)`
      : `No roster.csv found -- seeding demo roster (${roster.length} rows)`,
  );

  const db = getDb();

  // 1. Sections.
  const sectionDefs = new Map<string, string>();
  for (const row of roster) {
    if (row.sectionCode) {
      sectionDefs.set(row.sectionCode, row.sectionName ?? `Section ${row.sectionCode}`);
    }
  }

  const sectionIds = new Map<string, number>();
  for (const [code, name] of sectionDefs) {
    const [inserted] = await db
      .insert(sections)
      .values({ code, name, year: YEAR })
      .onConflictDoUpdate({
        target: [sections.code, sections.year],
        set: { name },
      })
      .returning({ id: sections.id });
    sectionIds.set(code, inserted!.id);
  }
  console.log(`  sections: ${sectionIds.size}`);

  // 2. People. Status stays "invited" until they actually sign in with Google.
  const userIds = new Map<string, string>();
  for (const row of roster) {
    const [inserted] = await db
      .insert(users)
      .values({ ucinetid: row.ucinetid, name: row.name, role: row.role })
      .onConflictDoUpdate({
        target: users.ucinetid,
        set: { name: row.name, role: row.role },
      })
      .returning({ id: users.id });
    userIds.set(row.ucinetid, inserted!.id);
  }
  console.log(`  users: ${userIds.size}`);

  // 3. Section membership -- this is what the instructor scoping reads.
  let enrolled = 0;
  let assigned = 0;
  for (const row of roster) {
    if (!row.sectionCode) continue;
    const sectionId = sectionIds.get(row.sectionCode);
    const userId = userIds.get(row.ucinetid);
    if (!sectionId || !userId) continue;

    if (row.role === "student") {
      await db
        .insert(enrollments)
        .values({ sectionId, studentId: userId })
        .onConflictDoNothing();
      enrolled++;
    } else if (row.role === "instructor") {
      await db
        .insert(sectionInstructors)
        .values({ sectionId, instructorId: userId })
        .onConflictDoNothing();
      assigned++;
    }
  }
  console.log(`  enrollments: ${enrolled}`);
  console.log(`  instructor assignments: ${assigned}`);
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
