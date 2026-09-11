"use client";
import { useEffect, useState } from "react";
import { Badge } from "../components/Badge";
import { InlineSelect } from "../components/InlineSelect";
import { ErrorBanner } from "../components/ErrorBanner";
import { QUEUE_STATUS, QUEUE_PRIORITY } from "@/lib/schema";

export default function QueuePage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("All");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
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
  useEffect(() => {
    load();
  }, []);

  const shown = rows.filter((r) => {
    if (filter === "All") return true;
    const s = r.props.Status?.name;
    return s === filter;
  });

  return (
    <div>
      <h1>Topic Queue</h1>
      <p className="subtitle">
        Rows set to <strong>Queued</strong> get picked up by the weekly research routine. Add or reprioritize topics here.
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
        <button onClick={() => setAdding(true)}>+ Add topic</button>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Topic</th>
              <th>Status</th>
              <th>Priority</th>
              <th>Angle / Notes</th>
              <th>Last Run</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id}>
                <td className="title-cell">
                  {r.props.Topic || <span className="muted">Untitled</span>}
                </td>
                <td>
                  <InlineSelect
                    apiBase="/api/queue"
                    id={r.id}
                    field="Status"
                    value={r.props.Status?.name || null}
                    options={QUEUE_STATUS}
                  />
                </td>
                <td>
                  <InlineSelect
                    apiBase="/api/queue"
                    id={r.id}
                    field="Priority"
                    value={r.props.Priority?.name || null}
                    options={["", ...QUEUE_PRIORITY]}
                  />
                </td>
                <td className="muted">{r.props["Angle Or Notes"] || "—"}</td>
                <td className="muted">{r.props["Last Run Date"] || "—"}</td>
              </tr>
            ))}
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
        body: JSON.stringify({
          Topic: topic.trim(),
          Status: "Queued",
          Priority: priority,
          "Angle Or Notes": angle.trim(),
        }),
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
