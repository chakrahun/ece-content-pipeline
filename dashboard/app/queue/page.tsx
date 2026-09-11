"use client";
import { useEffect, useRef, useState } from "react";
import { InlineSelect } from "../components/InlineSelect";
import { ErrorBanner } from "../components/ErrorBanner";
import { RunsPanel } from "../components/RunsPanel";
import { QUEUE_STATUS, QUEUE_PRIORITY } from "@/lib/schema";

export default function QueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);
  const [runningAll, setRunningAll] = useState(false);
  const jobsRef = useRef<any[]>([]);

  async function load() {
    try {
      const d = await (await fetch("/api/queue")).json();
      if (d.error) setError(d.error);
      else setRows(d.rows);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }
  async function loadJobs() {
    try {
      const d = await (await fetch("/api/run")).json();
      jobsRef.current = d.jobs || [];
      setJobs(d.jobs || []);
    } catch {}
  }

  useEffect(() => {
    load();
    loadJobs();
    const t = setInterval(async () => {
      const wasRunning = jobsRef.current.some((j) => j.status === "running");
      await loadJobs();
      // If runs were active, queue-row statuses may have flipped — refresh them.
      if (wasRunning) load();
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const shown = rows.filter((r) => filter === "All" || r.props.Status?.name === filter);
  const queuedCount = rows.filter((r) => r.props.Status?.name === "Queued").length;

  function jobForTopic(id: string) {
    return jobs.find((j) => j.status === "running" && j.topicId === id);
  }

  async function runTopic(row: any) {
    await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topicId: row.id, topic: row.props.Topic }),
    });
    await Promise.all([loadJobs(), load()]);
  }

  async function runAll() {
    setRunningAll(true);
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const d = await res.json();
      if (!res.ok) setError(d.error || "Failed to start runs.");
      await Promise.all([loadJobs(), load()]);
    } finally {
      setRunningAll(false);
    }
  }

  return (
    <div>
      <h1>Topic Queue</h1>
      <p className="subtitle">
        Add topics, reprioritize, or run the research + fact-check pipeline on demand. Runs write Findings to Notion,
        just like the weekly routine.
      </p>
      {error && <ErrorBanner message={error} />}

      <div className="toolbar">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option>All</option>
          {QUEUE_STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="muted">{shown.length} shown</span>
        <div className="spacer" />
        <button className="secondary" onClick={() => setAdding(true)}>
          + Add topic
        </button>
        <button onClick={runAll} disabled={runningAll || queuedCount === 0} title={queuedCount === 0 ? "No Queued topics" : ""}>
          {runningAll ? "Starting…" : `▶ Run all Queued (${queuedCount})`}
        </button>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "38%" }}>Topic</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Last Run</th>
              <th style={{ width: 110 }}></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const running = jobForTopic(r.id);
              const isQueued = r.props.Status?.name === "Queued";
              return (
                <tr key={r.id}>
                  <td className="title-cell">
                    {r.props.Topic || <span className="muted">Untitled</span>}
                    {r.props["Angle Or Notes"] && (
                      <div className="muted" style={{ fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                        {r.props["Angle Or Notes"]}
                      </div>
                    )}
                  </td>
                  <td>
                    <InlineSelect apiBase="/api/queue" id={r.id} field="Status" value={r.props.Status?.name || null} options={QUEUE_STATUS} />
                  </td>
                  <td>
                    <InlineSelect apiBase="/api/queue" id={r.id} field="Priority" value={r.props.Priority?.name || null} options={["", ...QUEUE_PRIORITY]} />
                  </td>
                  <td className="muted">{r.props["Last Run Date"] || "—"}</td>
                  <td>
                    {running ? (
                      <span className="badge" style={{ background: "rgba(51,126,169,0.2)", color: "#3277a4" }}>
                        running…
                      </span>
                    ) : (
                      <button
                        className="secondary"
                        style={{ padding: "4px 10px", fontSize: 12 }}
                        onClick={() => runTopic(r)}
                        title={isQueued ? "Run research + fact-check now" : "Re-run this topic"}
                      >
                        ▶ Run
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No topics{filter !== "All" ? ` with status "${filter}"` : ""}.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={5} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RunsPanel jobs={jobs} />

      {adding && (
        <AddTopicModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function AddTopicModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [topic, setTopic] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [angle, setAngle] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    if (!topic.trim()) return;
    setSaving(true);
    setErr("");
    try {
      const res = await fetch("/api/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ Topic: topic.trim(), Status: "Queued", Priority: priority, "Angle Or Notes": angle.trim() }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed");
      onAdded();
    } catch (e: any) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Add a topic to the queue</h2>
        {err && <div className="error">{err}</div>}
        <div className="field">
          <label>Topic (exact string handed to the research agent)</label>
          <input
            autoFocus
            value={topic}
            placeholder="e.g. sleep regressions in 18-24 month olds"
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            {QUEUE_PRIORITY.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>Angle / notes (optional)</label>
          <textarea rows={3} value={angle} onChange={(e) => setAngle(e.target.value)} />
        </div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
          <button className="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button onClick={submit} disabled={saving || !topic.trim()}>
            {saving ? "Adding…" : "Add to queue"}
          </button>
        </div>
      </div>
    </div>
  );
}
