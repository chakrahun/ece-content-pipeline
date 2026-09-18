import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { notion, DB, buildProp, queryAll, simplifyPage } from "./notion";
import { renderShot } from "./higgsfield";

// The repo root is the parent of the dashboard/ folder — that's where the
// .claude/agents/ subagents and the Notion MCP connection live.
const REPO_ROOT = path.resolve(process.cwd(), "..");

// Runs live in the OS temp dir so log writes never trip Next's file watcher.
const RUNS_DIR = path.join(os.tmpdir(), "ece-dashboard-runs");

// Native Windows binary. Overridable via env for other machines.
const CLAUDE_BIN =
  process.env.CLAUDE_BIN || "C:\\Users\\hunch\\.local\\bin\\claude.exe";

export type RunKind = "pipeline" | "ideas" | "script" | "visual" | "render";

export type Job = {
  id: string;
  topic: string;
  topicId: string | null; // Notion page id of the Topic Queue row, if any
  // "pipeline" = research + fact-check; "ideas" = idea-agent; "script" = script-writer on one idea;
  // "visual" = visual-agent breaks a draft into Higgsfield shot prompts; "render" = call Higgsfield on those shots
  kind: RunKind;
  targetUrl?: string | null; // for "script"/"visual"/"render": the Notion URL of the idea/draft
  draftId?: string | null; // for "render": the Notion page id of the draft whose shots to render
  status: "running" | "done" | "error";
  startedAt: string;
  endedAt?: string;
  exitCode?: number | null;
  summary?: string;
};

function ensureDir() {
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
}
const metaPath = (id: string) => path.join(RUNS_DIR, `${id}.json`);
const logPath = (id: string) => path.join(RUNS_DIR, `${id}.log`);

function saveJob(job: Job) {
  ensureDir();
  fs.writeFileSync(metaPath(job.id), JSON.stringify(job, null, 2));
}

// Render jobs run in-process (see startRun). If the server is stopped or crashes
// mid-render, finalize() never runs and the job file is left marked "running"
// forever — the UI then shows an ever-growing elapsed time for a job that no
// longer exists. On a genuine process start no in-process render can still be
// alive, so any render job still "running" on disk is necessarily orphaned and is
// swept to "error". We guard with a globalThis flag so a dev-mode HMR reload of
// this module (same process) does not wrongly sweep a render that is genuinely in
// flight in this process.
const SWEEP_FLAG = "__eceRendersSwept__";
function sweepOrphanedRenders() {
  if ((globalThis as any)[SWEEP_FLAG]) return;
  (globalThis as any)[SWEEP_FLAG] = true;
  ensureDir();
  for (const f of fs.readdirSync(RUNS_DIR)) {
    if (!f.endsWith(".json")) continue;
    try {
      const job = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), "utf8")) as Job;
      if (job.kind !== "render" || job.status !== "running") continue;
      job.status = "error";
      job.endedAt = new Date().toISOString();
      job.exitCode = null;
      job.summary = "Server stopped mid-render (orphaned run swept to error).";
      fs.writeFileSync(metaPath(job.id), JSON.stringify(job, null, 2));
      appendLog(job.id, "\n[swept] Server restarted before this render finished; marked as error.\n");
    } catch {
      // Skip unreadable/partial records; a later sweep or read will surface them.
    }
  }
}
// Runs once when this module first loads in a fresh server process.
sweepOrphanedRenders();

export function listJobs(limit = 30): Job[] {
  ensureDir();
  return fs
    .readdirSync(RUNS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), "utf8")) as Job;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a: any, b: any) => (a.startedAt < b.startedAt ? 1 : -1))
    .slice(0, limit) as Job[];
}

export function getJob(id: string): { job: Job; log: string } | null {
  if (!fs.existsSync(metaPath(id))) return null;
  const job = JSON.parse(fs.readFileSync(metaPath(id), "utf8")) as Job;
  const log = fs.existsSync(logPath(id)) ? fs.readFileSync(logPath(id), "utf8") : "";
  return { job, log };
}

// Is a topic already running? (avoid double-firing the same queue row)
export function isTopicRunning(topicId: string | null): boolean {
  if (!topicId) return false;
  return listJobs().some((j) => j.status === "running" && j.topicId === topicId);
}

// Is an idea run for this exact topic string already in flight?
export function isIdeaRunning(topic: string): boolean {
  const t = topic.trim().toLowerCase();
  return listJobs().some(
    (j) => j.status === "running" && j.kind === "ideas" && j.topic.trim().toLowerCase() === t
  );
}

// Is a script run for this exact idea (by Notion URL) already in flight?
export function isScriptRunning(ideaUrl: string): boolean {
  return listJobs().some(
    (j) => j.status === "running" && j.kind === "script" && j.targetUrl === ideaUrl
  );
}

// Is a visual (prompt-generation) or render run for this exact draft already in flight?
export function isVisualRunning(draftUrl: string): boolean {
  return listJobs().some(
    (j) => j.status === "running" && j.kind === "visual" && j.targetUrl === draftUrl
  );
}
export function isRenderRunning(draftUrl: string): boolean {
  return listJobs().some(
    (j) => j.status === "running" && j.kind === "render" && j.targetUrl === draftUrl
  );
}

function lastMeaningfulLine(text: string): string {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const line = lines[lines.length - 1] || "";
  return line.slice(0, 400);
}

async function setQueueStatus(topicId: string, status: string, done = false) {
  const properties: Record<string, any> = { Status: buildProp("select", status) };
  if (done) properties["Last Run Date"] = { date: { start: new Date().toISOString().slice(0, 10) } };
  try {
    await notion.pages.update({ page_id: topicId, properties });
  } catch {
    // Non-fatal: the run itself still succeeded/failed independently of this bookkeeping.
  }
}

function buildPrompt(topic: string): string {
  return `You are running ONE cycle of the ECE content pipeline for a single topic, non-interactively. Research + fact-check only — do NOT write any scripts or drafts.

Topic to process: "${topic}"

Steps:
1. Use the research-agent subagent to gather a batch of findings on this exact topic. It returns a JSON array of findings.
2. Hand that JSON batch to the fact-check-agent subagent. It verifies each record and writes every one (including rejects) to the "Early Childhood Content — Findings" Notion database.
3. Finish with a single final line in this exact form:
   RESULT: <n> findings written | <verdict counts, e.g. 4 VERIFIED, 1 REJECT>

Do not ask any questions — run to completion autonomously. Do not modify the Topic Queue; the dashboard handles queue status.`;
}

function buildIdeaPrompt(topic: string): string {
  return `You are generating content ideas for the ECE content pipeline, non-interactively. Idea generation only — do NOT research, fact-check, or write scripts.

Topic to process: "${topic}"

Steps:
1. Use the idea-agent subagent for this exact topic. It reads only VERIFIED / VERIFIED_WITH_CAVEATS findings for the topic from the "Early Childhood Content — Findings" Notion database and generates a spread of educational content ideas and digital-product concepts, writing each as a page in the "Early Childhood Content — Content Ideas" Notion database (Status = New).
2. If there are no verified findings for the topic, do not invent any — report that the topic needs more research first.
3. Finish with a single final line in this exact form:
   RESULT: <n> ideas written | <format spread, e.g. 4 digital products, 2 carousels, 2 video>

Do not ask any questions — run to completion autonomously.`;
}

function buildScriptPrompt(ideaTitle: string, ideaUrl: string): string {
  return `You are drafting ONE already-selected content idea into a finished draft for the ECE content pipeline, non-interactively. Drafting only — do NOT research, fact-check, or generate new ideas.

Idea to draft: "${ideaTitle}"
Idea Notion page URL: ${ideaUrl}

Steps:
1. Use the script-writer-agent subagent, instructing it to draft EXACTLY this one idea, identified by the Notion page URL above. It reads the idea, re-grounds it in the idea's Source Findings, drafts the real content for the idea's Product Format, writes the draft to the "Early Childhood Content — Content Drafts" Notion database (Status = Needs Review, linked back to the idea and its findings), and moves this idea's Status to In Production.
2. If the idea has no Source Findings, do not draft from its prose alone — report that it was skipped and why.
3. Finish with a single final line in this exact form:
   RESULT: draft created | <format> | <source-mix summary>

Do not ask any questions — run to completion autonomously.`;
}

function buildVisualPrompt(draftTitle: string, draftUrl: string): string {
  return `You are generating Higgsfield visual shot prompts for ONE approved content draft, non-interactively. Prompt generation only — do NOT call any external image/video API, do NOT research, fact-check, or rewrite the draft.

Draft to break into visuals: "${draftTitle}"
Draft Notion page URL: ${draftUrl}

Steps:
1. Use the visual-agent subagent, instructing it to break EXACTLY this one draft (identified by the Notion page URL above) into a sequence of shots and write each shot as a page in the "Early Childhood Content — Content Assets" Notion database (Status = Prompt Ready), each carrying the draft's title, URL and page id so the render step can find them.
2. If the draft's Script Body is empty, do not invent shots — report that it was skipped and why.
3. Finish with a single final line in this exact form:
   RESULT: <n> shots written | <breakdown, e.g. 6 image, 1 video>

Do not ask any questions — run to completion autonomously.`;
}

function appendLog(id: string, s: string) {
  try {
    fs.appendFileSync(logPath(id), s);
  } catch {}
}

// Finalize any job (spawned or in-process). Reads the queue id off the job itself.
async function finalize(id: string, status: Job["status"], code: number | null) {
  const fresh = getJob(id)?.job;
  if (!fresh || fresh.status !== "running") return; // already finalized (or gone)
  fresh.status = status;
  fresh.endedAt = new Date().toISOString();
  fresh.exitCode = code;
  const log = fs.existsSync(logPath(id)) ? fs.readFileSync(logPath(id), "utf8") : "";
  fresh.summary = lastMeaningfulLine(log) || (status === "error" ? "Run failed" : "Done");
  saveJob(fresh);
  if (fresh.topicId) {
    await setQueueStatus(fresh.topicId, status === "done" ? "Done" : "Queued", status === "done");
  }
}

// Match asset rows to their draft regardless of dash formatting in the stored id.
const normId = (s: string) => (s || "").replace(/-/g, "").toLowerCase();

// The "render" step: call Higgsfield on every Prompt-Ready shot for one draft and
// write the resulting media URLs back to the Content Assets rows. Runs in-process
// (no subagent) because the API key and HTTP calls belong on the server.
async function renderDraftAssets(id: string, draftId: string) {
  const target = normId(draftId);
  const rows = (await queryAll(DB.assets)).map(simplifyPage);
  const shots = rows
    .filter((r) => normId(r.props["Draft ID"] || "") === target && r.props.Status?.name === "Prompt Ready")
    .sort((a, b) => (a.props.Order ?? 0) - (b.props.Order ?? 0));

  if (shots.length === 0) {
    appendLog(id, "No shots with Status = Prompt Ready for this draft. Nothing to render.\n");
    appendLog(id, "RESULT: 0 shots rendered\n");
    return true;
  }

  appendLog(id, `Rendering ${shots.length} shot${shots.length === 1 ? "" : "s"} via Higgsfield…\n`);
  let rendered = 0;
  let failed = 0;

  for (const s of shots) {
    const p = s.props;
    const name = p.Shot || "(untitled shot)";
    appendLog(id, `\n▶ ${name}  [${p["Shot Type"]?.name || "?"} · ${p.Model?.name || "no model"}]\n`);
    try {
      await notion.pages.update({ page_id: s.id, properties: { Status: buildProp("select", "Rendering") } });
      const result = await renderShot({
        model: p.Model?.name,
        shotType: p["Shot Type"]?.name,
        prompt: p.Prompt || "",
        inputImageUrl: p["Input Image URL"],
        aspectRatio: p["Aspect Ratio"]?.name,
        resolution: p.Resolution?.name,
        duration: p.Duration?.name,
        seed: p.Seed,
      });
      await notion.pages.update({
        page_id: s.id,
        properties: {
          Status: buildProp("select", "Rendered"),
          "Media URL": buildProp("url", result.url),
          "Request ID": buildProp("rich_text", result.requestId || ""),
          Error: buildProp("rich_text", ""),
        },
      });
      appendLog(id, `  ✓ ${result.url}\n`);
      rendered++;
    } catch (e: any) {
      const msg = (e?.message || String(e)).slice(0, 400);
      appendLog(id, `  ✗ ${msg}\n`);
      await notion.pages
        .update({
          page_id: s.id,
          properties: { Status: buildProp("select", "Failed"), Error: buildProp("rich_text", msg) },
        })
        .catch(() => {});
      failed++;
    }
  }

  appendLog(
    id,
    `\nRESULT: ${rendered}/${shots.length} rendered${failed ? ` | ${failed} failed` : ""}\n`
  );
  // Treat a run where at least one shot rendered as success; total failure is an error.
  return rendered > 0 || failed === 0;
}

export function startRun(
  topic: string,
  topicId: string | null,
  kind: RunKind = "pipeline",
  targetUrl: string | null = null,
  draftId: string | null = null
): Job {
  ensureDir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id,
    topic,
    topicId,
    kind,
    targetUrl,
    draftId,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  saveJob(job);
  const kindLabel =
    kind === "ideas"
      ? "idea generation"
      : kind === "script"
      ? "script draft"
      : kind === "visual"
      ? "visual shot prompts"
      : kind === "render"
      ? "Higgsfield render"
      : "research + fact-check";
  fs.writeFileSync(logPath(id), `# Run started ${job.startedAt}\n# Kind: ${kindLabel}\n# Topic: ${topic}\n\n`);

  // The render step does not spawn a subagent — it calls Higgsfield directly in-process.
  if (kind === "render") {
    renderDraftAssets(id, draftId || "")
      .then((ok) => finalize(id, ok ? "done" : "error", ok ? 0 : 1))
      .catch((err) => {
        appendLog(id, `\n[render error] ${err?.message || String(err)}\n`);
        finalize(id, "error", null);
      });
    return job;
  }

  const prompt =
    kind === "ideas"
      ? buildIdeaPrompt(topic)
      : kind === "script"
      ? buildScriptPrompt(topic, targetUrl || "")
      : kind === "visual"
      ? buildVisualPrompt(topic, targetUrl || "")
      : buildPrompt(topic);
  const child = spawn(
    CLAUDE_BIN,
    ["-p", prompt, "--permission-mode", "bypassPermissions"],
    {
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
      // Prompt is passed as an arg; give the CLI no stdin so it doesn't wait 3s
      // for piped input. stdout/stderr stay pipes so we can capture the log.
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const append = (chunk: Buffer) => appendLog(id, chunk.toString());
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  child.on("error", (err) => {
    appendLog(id, `\n[spawn error] ${String(err)}\n`);
    finalize(id, "error", null);
  });
  child.on("close", (code) => finalize(id, code === 0 ? "done" : "error", code));

  if (topicId) setQueueStatus(topicId, "In Progress");
  return job;
}
