/**
 * Minimal Canvas REST client: pushes one grade and comment for one student on
 * one assignment.
 *
 * Students are addressed as `sis_login_id:<ucinetid>` rather than by Canvas
 * user id, so no mapping table is needed -- this app already keys on UCInetID,
 * which is what UCI Canvas uses as the SIS login.
 *
 * One-way on purpose. Pulling rosters or grades back out of Canvas is a much
 * larger problem and nothing here needs it.
 */

export type CanvasConfig = {
  baseUrl: string;
  token: string;
  courseId: string;
};

export function canvasConfig(): CanvasConfig | null {
  const baseUrl = process.env.CANVAS_BASE_URL?.replace(/\/+$/, "");
  const token = process.env.CANVAS_TOKEN;
  const courseId = process.env.CANVAS_COURSE_ID;
  if (!baseUrl || !token || !courseId) return null;
  return { baseUrl, token, courseId };
}

export type CanvasPushResult =
  | { ok: true; canvasGrade: string | null }
  /** retryable distinguishes "Canvas was down" from "this will never work". */
  | { ok: false; error: string; retryable: boolean };

export async function pushGrade(input: {
  assignmentId: number;
  ucinetid: string;
  score: number;
  comment?: string | null;
}): Promise<CanvasPushResult> {
  const config = canvasConfig();
  if (!config) {
    return {
      ok: false,
      error: "Canvas is not configured (CANVAS_BASE_URL, CANVAS_TOKEN, CANVAS_COURSE_ID).",
      retryable: false,
    };
  }

  const url =
    `${config.baseUrl}/api/v1/courses/${config.courseId}` +
    `/assignments/${input.assignmentId}` +
    `/submissions/sis_login_id:${encodeURIComponent(input.ucinetid)}`;

  const body = new URLSearchParams();
  body.set("submission[posted_grade]", String(input.score));
  if (input.comment) body.set("comment[text_comment]", input.comment);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      // Canvas can be slow; don't hang a cron run on one student.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "could not reach Canvas",
      retryable: true,
    };
  }

  if (response.ok) {
    let canvasGrade: string | null = null;
    try {
      const json = (await response.json()) as { grade?: string | null };
      canvasGrade = json.grade ?? null;
    } catch {
      /* a 200 with an unparseable body still means it landed */
    }
    return { ok: true, canvasGrade };
  }

  const text = await response.text().catch(() => "");
  const detail = text.slice(0, 220);

  // 401/403 means the token is wrong or lacks grading rights; 404 means the
  // assignment id is wrong or the student is not in the course. Retrying those
  // forever would just hide a configuration mistake.
  const retryable = response.status === 429 || response.status >= 500;

  return {
    ok: false,
    error: `Canvas returned ${response.status}${detail ? `: ${detail}` : ""}`,
    retryable,
  };
}

/** Confirms the token works and names the course, for the admin screen. */
export async function checkCanvas(): Promise<
  { ok: true; courseName: string; user: string } | { ok: false; error: string }
> {
  const config = canvasConfig();
  if (!config) return { ok: false, error: "Canvas is not configured." };

  try {
    const [courseRes, userRes] = await Promise.all([
      fetch(`${config.baseUrl}/api/v1/courses/${config.courseId}`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(15_000),
      }),
      fetch(`${config.baseUrl}/api/v1/users/self`, {
        headers: { Authorization: `Bearer ${config.token}` },
        signal: AbortSignal.timeout(15_000),
      }),
    ]);

    if (!courseRes.ok) {
      return {
        ok: false,
        error: `Course ${config.courseId} returned ${courseRes.status}. Check CANVAS_COURSE_ID and that the token's account is in the course.`,
      };
    }
    if (!userRes.ok) {
      return { ok: false, error: `Token rejected (${userRes.status}). Check CANVAS_TOKEN.` };
    }

    const course = (await courseRes.json()) as { name?: string };
    const user = (await userRes.json()) as { name?: string };
    return {
      ok: true,
      courseName: course.name ?? `course ${config.courseId}`,
      user: user.name ?? "unknown",
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "could not reach Canvas" };
  }
}
