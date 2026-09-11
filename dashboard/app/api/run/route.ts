import { NextRequest, NextResponse } from "next/server";
import { DB, queryAll, simplifyPage, assertConfigured } from "@/lib/notion";
import { startRun, listJobs, isTopicRunning } from "@/lib/runner";

export const dynamic = "force-dynamic";

// List recent runs (for the activity panel).
export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

// Start a run. Body:
//   { topicId, topic }              -> run one topic
//   { all: true }                   -> run every Queued topic
export async function POST(req: NextRequest) {
  try {
    assertConfigured();
    const body = await req.json();
    const started: any[] = [];
    const skipped: any[] = [];

    if (body.all) {
      const rows = (await queryAll(DB.queue)).map(simplifyPage);
      const queued = rows.filter((r) => r.props.Status?.name === "Queued");
      if (queued.length === 0) {
        return NextResponse.json({ error: "No topics with status Queued." }, { status: 400 });
      }
      for (const r of queued) {
        const topic = r.props.Topic;
        if (!topic) continue;
        if (isTopicRunning(r.id)) {
          skipped.push({ topic, reason: "already running" });
          continue;
        }
        started.push(startRun(topic, r.id));
      }
    } else {
      const topic = (body.topic || "").trim();
      if (!topic) return NextResponse.json({ error: "topic is required." }, { status: 400 });
      if (body.topicId && isTopicRunning(body.topicId)) {
        return NextResponse.json({ error: "This topic is already running." }, { status: 409 });
      }
      started.push(startRun(topic, body.topicId || null));
    }

    return NextResponse.json({ started, skipped });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
