import { NextResponse } from "next/server";
import { runPurge } from "@/lib/purge";

/**
 * Scheduled retention sweep. Vercel Cron calls this with
 * `Authorization: Bearer $CRON_SECRET`, so the endpoint is not open to the
 * internet. Without CRON_SECRET set it refuses outright rather than running
 * unauthenticated -- this endpoint deletes files.
 *
 * Add `?dry=1` to see what it would do without touching anything.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET is not configured, so the purge endpoint is disabled." },
      { status: 503 },
    );
  }

  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = new URL(request.url).searchParams.get("dry") === "1";

  try {
    const report = await runPurge({ dryRun });
    // Logged so a scheduled run leaves a trace in the Vercel logs even though
    // nobody sees the response.
    console.log("[purge]", JSON.stringify(report));
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "purge failed";
    console.error("[purge] failed", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
