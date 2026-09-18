import { NextRequest, NextResponse } from "next/server";
import { DB, queryAll, simplifyPage, assertConfigured } from "@/lib/notion";
import {
  startRun,
  listJobs,
  isTopicRunning,
  isIdeaRunning,
  isScriptRunning,
  isVisualRunning,
  isRenderRunning,
} from "@/lib/runner";

export const dynamic = "force-dynamic";

// List recent runs (for the activity panel).
export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}

// Start a run. Body:
//   { topicId, topic }              -> run research + fact-check on one topic
//   { all: true }                   -> run research + fact-check on every Queued topic
//   { kind: "ideas", topic }        -> generate content ideas for a topic
//   { kind: "script", ideaUrl, ideaTitle } -> draft one selected idea into a script
export async function POST(req: NextRequest) {
  try {
    assertConfigured();
    const body = await req.json();
    const started: any[] = [];
    const skipped: any[] = [];

    if (body.kind === "ideas") {
      const topic = (body.topic || "").trim();
      if (!topic) return NextResponse.json({ error: "topic is required." }, { status: 400 });
      if (isIdeaRunning(topic)) {
        return NextResponse.json({ error: "Idea generation for this topic is already running." }, { status: 409 });
      }
      started.push(startRun(topic, null, "ideas"));
      return NextResponse.json({ started, skipped });
    }

    if (body.kind === "script") {
      const ideaUrl = (body.ideaUrl || "").trim();
      const ideaTitle = (body.ideaTitle || "").trim() || "Untitled idea";
      if (!ideaUrl) return NextResponse.json({ error: "ideaUrl is required." }, { status: 400 });
      if (isScriptRunning(ideaUrl)) {
        return NextResponse.json({ error: "A script run for this idea is already running." }, { status: 409 });
      }
      started.push(startRun(ideaTitle, null, "script", ideaUrl));
      return NextResponse.json({ started, skipped });
    }

    if (body.kind === "visual") {
      const draftUrl = (body.draftUrl || "").trim();
      const draftTitle = (body.draftTitle || "").trim() || "Untitled draft";
      if (!draftUrl) return NextResponse.json({ error: "draftUrl is required." }, { status: 400 });
      if (isVisualRunning(draftUrl)) {
        return NextResponse.json({ error: "Visual prompts for this draft are already being generated." }, { status: 409 });
      }
      started.push(startRun(draftTitle, null, "visual", draftUrl));
      return NextResponse.json({ started, skipped });
    }

    if (body.kind === "render") {
      const draftUrl = (body.draftUrl || "").trim();
      const draftId = (body.draftId || "").trim();
      const draftTitle = (body.draftTitle || "").trim() || "Untitled draft";
      if (!draftId) return NextResponse.json({ error: "draftId is required." }, { status: 400 });
      if (isRenderRunning(draftUrl)) {
        return NextResponse.json({ error: "A Higgsfield render for this draft is already running." }, { status: 409 });
      }
      started.push(startRun(draftTitle, null, "render", draftUrl, draftId));
      return NextResponse.json({ started, skipped });
    }

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
