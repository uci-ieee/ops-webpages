import { eq, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { enrollments, sectionInstructors, sections, users } from "./db/schema";
import type { Role } from "./db/schema";

/** Default academic year for imports. Bump each September. */
export const CURRENT_YEAR = "2026-2027";

export type RosterRow = {
  ucinetid: string;
  name: string;
  role: Role;
  sectionCode: string | null;
  sectionName: string | null;
};

export type ParseResult = {
  rows: RosterRow[];
  errors: string[];
};

const ROLES: Role[] = ["student", "instructor", "admin"];

/**
 * Splits one delimited line, honouring double-quoted fields. Needed because
 * names arrive as "Nguyen, Marvin" often enough that a naive split would
 * corrupt the roster silently.
 */
function splitLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

/**
 * Parses a pasted roster. Accepts comma- or tab-separated input, because
 * copying a block of cells out of Google Sheets or Excel yields tabs, and that
 * is how this will actually get used.
 *
 * Required column: ucinetid. Optional: name, role, section_code, section_name.
 * Nothing is written unless every line parses.
 */
export function parseRoster(text: string): ParseResult {
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return { rows: [], errors: ["Nothing pasted."] };

  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const header = splitLine(lines[0]!, delimiter).map((h) => h.toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);

  if (col("ucinetid") === -1) {
    return {
      rows: [],
      errors: [
        "First line must be a header row containing \"ucinetid\". Got: " + lines[0]!.slice(0, 80),
      ],
    };
  }

  const seen = new Map<string, number>();
  const rows: RosterRow[] = [];

  lines.slice(1).forEach((line, i) => {
    const lineNo = i + 2; // 1-indexed, and the header is line 1
    const cells = splitLine(line, delimiter);
    const pick = (name: string) => {
      const idx = col(name);
      return idx === -1 ? "" : (cells[idx] ?? "");
    };

    // Tolerate a full email in the ucinetid column -- people paste either.
    const ucinetid = pick("ucinetid").toLowerCase().split("@")[0]!.trim();
    if (!ucinetid) {
      errors.push("Line " + lineNo + ": missing ucinetid");
      return;
    }
    if (!/^[a-z][a-z0-9]*$/.test(ucinetid)) {
      errors.push(
        "Line " + lineNo + ": " + ucinetid + " is not a valid UCInetID (letters and digits only)",
      );
      return;
    }
    const dupe = seen.get(ucinetid);
    if (dupe) {
      errors.push("Line " + lineNo + ": " + ucinetid + " already appears on line " + dupe);
      return;
    }
    seen.set(ucinetid, lineNo);

    const rawRole = pick("role").toLowerCase() || "student";
    if (!ROLES.includes(rawRole as Role)) {
      errors.push(
        "Line " + lineNo + ": role " + rawRole + " must be student, instructor, or admin",
      );
      return;
    }

    // An instructor with no section_code is allowed: officers are usually added
    // before sections exist, and the instructor dashboard already handles it
    // ("No sections are assigned to you yet"). They simply see nobody until a
    // later import gives them a section.
    const sectionCode = pick("section_code") || null;

    rows.push({
      ucinetid,
      name: pick("name") || ucinetid,
      role: rawRole as Role,
      sectionCode,
      sectionName: pick("section_name") || (sectionCode ? "Section " + sectionCode : null),
    });
  });

  return { rows, errors };
}

export type ApplyResult = {
  sectionsTouched: number;
  usersCreated: number;
  usersUpdated: number;
  enrollments: number;
  instructorAssignments: number;
};

/**
 * Upserts a parsed roster. Idempotent -- re-importing the same list changes
 * nothing, so a nervous second paste is harmless. Never deletes anyone;
 * removing people is a separate, explicit action.
 */
export async function applyRoster(rows: RosterRow[], year = CURRENT_YEAR): Promise<ApplyResult> {
  const db = getDb();
  if (rows.length === 0) {
    return {
      sectionsTouched: 0,
      usersCreated: 0,
      usersUpdated: 0,
      enrollments: 0,
      instructorAssignments: 0,
    };
  }

  // Which of these already exist, so the summary can distinguish created from
  // updated rather than claiming everything is new.
  const existing = await db
    .select({ ucinetid: users.ucinetid })
    .from(users)
    .where(
      inArray(
        users.ucinetid,
        rows.map((r) => r.ucinetid),
      ),
    );
  const existingIds = new Set(existing.map((e) => e.ucinetid));

  // 1. Sections.
  const sectionDefs = new Map<string, string>();
  for (const row of rows) {
    if (row.sectionCode) {
      sectionDefs.set(row.sectionCode, row.sectionName ?? "Section " + row.sectionCode);
    }
  }

  const sectionIds = new Map<string, number>();
  for (const [code, name] of sectionDefs) {
    const [inserted] = await db
      .insert(sections)
      .values({ code, name, year })
      .onConflictDoUpdate({ target: [sections.code, sections.year], set: { name } })
      .returning({ id: sections.id });
    sectionIds.set(code, inserted!.id);
  }

  // 2. People. Status is left alone deliberately: it flips to "active" on first
  // sign-in, and a re-import must not reset someone who has already signed in.
  const userIds = new Map<string, string>();
  for (const row of rows) {
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

  // 3. Section membership -- what the instructor scoping reads.
  let enrolled = 0;
  let assigned = 0;
  for (const row of rows) {
    if (!row.sectionCode) continue;
    const sectionId = sectionIds.get(row.sectionCode);
    const userId = userIds.get(row.ucinetid);
    if (!sectionId || !userId) continue;

    if (row.role === "student") {
      await db.insert(enrollments).values({ sectionId, studentId: userId }).onConflictDoNothing();
      enrolled++;
    } else if (row.role === "instructor") {
      await db
        .insert(sectionInstructors)
        .values({ sectionId, instructorId: userId })
        .onConflictDoNothing();
      assigned++;
    }
  }

  const created = rows.filter((r) => !existingIds.has(r.ucinetid)).length;
  return {
    sectionsTouched: sectionIds.size,
    usersCreated: created,
    usersUpdated: rows.length - created,
    enrollments: enrolled,
    instructorAssignments: assigned,
  };
}

/**
 * Deletes the synthetic roster the demo seed creates (student001.., instructor01..,
 * admin1..3) and nothing else. Matched by exact pattern AND restricted to
 * accounts that have never signed in, so it cannot take a real person with it.
 */
export async function removeDemoRoster(): Promise<{ deleted: string[] }> {
  const db = getDb();
  const candidates = await db.select({ ucinetid: users.ucinetid, status: users.status }).from(users);

  const demo = candidates
    .filter(
      (u) =>
        u.status === "invited" &&
        (/^student\d{3}$/.test(u.ucinetid) ||
          /^instructor\d{2}$/.test(u.ucinetid) ||
          /^admin[123]$/.test(u.ucinetid)),
    )
    .map((u) => u.ucinetid);

  if (demo.length === 0) return { deleted: [] };

  // enrollments and section_instructors cascade from users.
  await db.delete(users).where(inArray(users.ucinetid, demo));
  return { deleted: demo };
}

/** Removes sections that no longer have any student or instructor attached. */
export async function pruneEmptySections(): Promise<number> {
  const db = getDb();
  const all = await db.select({ id: sections.id }).from(sections);
  let removed = 0;
  for (const s of all) {
    const [student] = await db
      .select({ id: enrollments.studentId })
      .from(enrollments)
      .where(eq(enrollments.sectionId, s.id))
      .limit(1);
    const [instructor] = await db
      .select({ id: sectionInstructors.instructorId })
      .from(sectionInstructors)
      .where(eq(sectionInstructors.sectionId, s.id))
      .limit(1);
    if (!student && !instructor) {
      await db.delete(sections).where(eq(sections.id, s.id));
      removed++;
    }
  }
  return removed;
}
