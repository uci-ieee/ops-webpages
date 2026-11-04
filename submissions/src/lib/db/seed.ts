/**
 * Loads a roster from the command line.
 *
 * Reads `submissions/roster.csv` if it exists, otherwise synthesizes a roster at
 * the size OPS actually runs at (135 students, 12 instructors, 3 admins,
 * 12 sections) so the dashboards can be judged at real scale.
 *
 * Parsing and writing are shared with the admin import screen
 * (`src/lib/roster.ts`) so the two paths cannot drift apart.
 *
 * CSV columns (header row required): ucinetid,name,role,section_code,section_name
 *
 * Safe to re-run: every write is an upsert.
 */
import { config as loadEnv } from "dotenv";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { CURRENT_YEAR, applyRoster, parseRoster, type RosterRow } from "../roster";

loadEnv({ path: resolve(process.cwd(), ".env.local"), override: true });

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
  let roster: RosterRow[];

  if (existsSync(csvPath)) {
    const { rows, errors } = parseRoster(readFileSync(csvPath, "utf8"));
    if (errors.length > 0) {
      console.error(`roster.csv has ${errors.length} problem(s); nothing was written:`);
      for (const e of errors) console.error("  " + e);
      process.exit(1);
    }
    console.log(`Seeding from roster.csv (${rows.length} rows)`);
    roster = rows;
  } else {
    roster = demoRoster();
    console.log(`No roster.csv found -- seeding demo roster (${roster.length} rows)`);
  }

  const result = await applyRoster(roster, CURRENT_YEAR);
  console.log(`  sections touched:       ${result.sectionsTouched}`);
  console.log(`  people added:           ${result.usersCreated}`);
  console.log(`  people updated:         ${result.usersUpdated}`);
  console.log(`  enrollments:            ${result.enrollments}`);
  console.log(`  instructor assignments: ${result.instructorAssignments}`);
  console.log("Done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
