import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { notion, DB, buildProp } from "./notion";

// The repo root is the parent of the dashboard/ folder — that's where the
// .claude/agents/ subagents and the Notion MCP connection live.
const REPO_ROOT = path.resolve(process.cwd(), "..");

// Runs live in the OS temp dir so log writes never trip Next's file watcher.
const RUNS_DIR = path.join(os.tmpdir(), "ece-dashboard-runs");

// Native Windows binary. Overridable via env for other machines.
const CLAUDE_BIN =
  process.env.CLAUDE_BIN || "C:\\Users\\hunch\\.local\\bin\\claude.exe";

export type Job = {
  id: string;
  topic: string;
  topicId: string | null; // Notion page id of the Topic Queue row, if any
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

export function startRun(topic: string, topicId: string | null): Job {
  ensureDir();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const job: Job = {
    id,
    topic,
    topicId,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  saveJob(job);
  fs.writeFileSync(logPath(id), `# Run started ${job.startedAt}\n# Topic: ${topic}\n\n`);

  const child = spawn(
    CLAUDE_BIN,
    ["-p", buildPrompt(topic), "--permission-mode", "bypassPermissions"],
    {
      cwd: REPO_ROOT,
      env: process.env,
      windowsHide: true,
      // Prompt is passed as an arg; give the CLI no stdin so it doesn't wait 3s
      // for piped input. stdout/stderr stay pipes so we can capture the log.
      stdio: ["ignore", "pipe", "pipe"],
    }
  );

  const append = (chunk: Buffer) => {
    try {
      fs.appendFileSync(logPath(id), chunk.toString());
    } catch {}
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const finalize = async (status: Job["status"], code: number | null) => {
    const fresh = getJob(id)?.job || job;
    if (fresh.status !== "running") return; // already finalized
    fresh.status = status;
    fresh.endedAt = new Date().toISOString();
    fresh.exitCode = code;
    const log = fs.existsSync(logPath(id)) ? fs.readFileSync(logPath(id), "utf8") : "";
    fresh.summary = lastMeaningfulLine(log) || (status === "error" ? "Run failed" : "Done");
    saveJob(fresh);
    if (topicId) await setQueueStatus(topicId, status === "done" ? "Done" : "Queued", status === "done");
  };

  child.on("error", (err) => {
    append(Buffer.from(`\n[spawn error] ${String(err)}\n`));
    finalize("error", null);
  });
  child.on("close", (code) => finalize(code === 0 ? "done" : "error", code));

  if (topicId) setQueueStatus(topicId, "In Progress");
  return job;
}
