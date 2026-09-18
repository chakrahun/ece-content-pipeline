"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge, Badges } from "../components/Badge";
import { InlineSelect } from "../components/InlineSelect";
import { ErrorBanner } from "../components/ErrorBanner";
import { RunsPanel } from "../components/RunsPanel";
import { DRAFT_STATUS } from "@/lib/schema";

export default function DraftsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("All");
  const [detail, setDetail] = useState<any>(null);
  const [visualJobs, setVisualJobs] = useState<any[]>([]);
  const [renderJobs, setRenderJobs] = useState<any[]>([]);
  const jobsRef = useRef<any[]>([]);

  async function load() {
    try {
      const d = await (await fetch("/api/drafts")).json();
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
      const all = d.jobs || [];
      const vis = all.filter((j: any) => j.kind === "visual");
      const ren = all.filter((j: any) => j.kind === "render");
      jobsRef.current = [...vis, ...ren];
      setVisualJobs(vis);
      setRenderJobs(ren);
    } catch {}
  }

  useEffect(() => {
    load();
    loadJobs();
    const t = setInterval(async () => {
      const wasRunning = jobsRef.current.some((j) => j.status === "running");
      await loadJobs();
      if (wasRunning) load();
    }, 3500);
    return () => clearInterval(t);
  }, []);

  const shown = useMemo(
    () => rows.filter((r) => status === "All" || r.props.Status?.name === status),
    [rows, status]
  );

  return (
    <div>
      <h1>Drafts</h1>
      <p className="subtitle">
        Drafts written from selected ideas. Read the body and set the review status. Open a draft and hit
        “Generate visuals” to break it into Higgsfield shot prompts, then “Render visuals” to generate them.
      </p>
      {error && <ErrorBanner message={error} />}

      <div className="toolbar">
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option>All</option>
          {DRAFT_STATUS.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <span className="muted">{shown.length} shown</span>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "40%" }}>Title / Hook</th>
              <th>Format</th>
              <th>Topic</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }}>
                <td className="title-cell" onClick={() => setDetail(r)}>
                  {r.props["Title Or Hook"] || <span className="muted">Untitled</span>}
                  {r.props["Source Mix Summary"] && (
                    <div className="muted" style={{ fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                      {r.props["Source Mix Summary"]}
                    </div>
                  )}
                </td>
                <td onClick={() => setDetail(r)}>
                  <Badge value={r.props.Format} />
                </td>
                <td onClick={() => setDetail(r)}>
                  <Badges values={r.props.Topic} />
                </td>
                <td>
                  <InlineSelect
                    apiBase="/api/drafts"
                    id={r.id}
                    field="Status"
                    value={r.props.Status?.name || null}
                    options={DRAFT_STATUS}
                  />
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={4} className="empty">
                  No drafts{status !== "All" ? ` with status "${status}"` : ""}.
                </td>
              </tr>
            )}
            {loading && (
              <tr>
                <td colSpan={4} className="empty">
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {(visualJobs.length > 0 || renderJobs.length > 0) && (
        <>
          <RunsPanel jobs={visualJobs} title="Visual prompt runs" />
          <RunsPanel jobs={renderJobs} title="Higgsfield render runs" />
        </>
      )}

      {detail && (
        <DraftDetail
          row={detail}
          onClose={() => setDetail(null)}
          visualRunning={visualJobs.some((j) => j.status === "running" && j.targetUrl === detail.url)}
          renderRunning={renderJobs.some((j) => j.status === "running" && j.targetUrl === detail.url)}
          onStartedJob={loadJobs}
          onError={setError}
        />
      )}
    </div>
  );
}

function DraftDetail({
  row,
  onClose,
  visualRunning,
  renderRunning,
  onStartedJob,
  onError,
}: {
  row: any;
  onClose: () => void;
  visualRunning: boolean;
  renderRunning: boolean;
  onStartedJob: () => void;
  onError: (msg: string) => void;
}) {
  const p = row.props;
  const [shots, setShots] = useState<any[]>([]);
  const [loadingShots, setLoadingShots] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);

  async function loadShots() {
    try {
      const d = await (await fetch(`/api/assets?draftId=${encodeURIComponent(row.id)}`)).json();
      if (!d.error) setShots(d.rows || []);
    } catch {
    } finally {
      setLoadingShots(false);
    }
  }

  useEffect(() => {
    loadShots();
    const t = setInterval(loadShots, 3500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  const promptReady = shots.filter((s) => s.props.Status?.name === "Prompt Ready").length;

  async function run(kind: "visual" | "render") {
    setStarting(kind);
    onError("");
    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          draftUrl: row.url,
          draftId: row.id,
          draftTitle: p["Title Or Hook"] || "",
        }),
      });
      const d = await res.json();
      if (!res.ok) onError(d.error || `Failed to start ${kind}.`);
      onStartedJob();
    } finally {
      setStarting(null);
    }
  }

  const busyVisual = starting === "visual" || visualRunning;
  const busyRender = starting === "render" || renderRunning;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{p["Title Or Hook"] || "Draft"}</h2>
        <div className="badges" style={{ marginBottom: 12 }}>
          <Badge value={p.Format} />
          <Badge value={p.Status} />
          <Badges values={p.Topic} />
        </div>
        {p["Source Mix Summary"] && (
          <p className="muted" style={{ marginTop: 0 }}>
            {p["Source Mix Summary"]}
          </p>
        )}
        {p["Framing Notes"] && (
          <div className="field">
            <label>Framing notes</label>
            <div>{p["Framing Notes"]}</div>
          </div>
        )}
        <div className="field">
          <label>Script body</label>
          <div className="script-body">{p["Script Body"] || "— empty —"}</div>
        </div>

        <div className="field">
          <label>Visuals (Higgsfield)</label>
          {loadingShots ? (
            <div className="muted">Loading shots…</div>
          ) : shots.length === 0 ? (
            <div className="muted">
              No shots yet. Hit “Generate visuals” to break this draft into Higgsfield shot prompts.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {shots.map((s) => (
                <div
                  key={s.id}
                  style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                >
                  <span className="muted" style={{ minWidth: 22 }}>
                    {s.props.Order ?? "•"}
                  </span>
                  <span style={{ flex: 1 }}>{s.props.Shot || "(untitled shot)"}</span>
                  <Badge value={s.props["Shot Type"]} />
                  <Badge value={s.props.Status} />
                  {s.props["Media URL"] && (
                    <a className="link" href={s.props["Media URL"]} target="_blank" rel="noreferrer">
                      view ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button
            onClick={() => run("visual")}
            disabled={busyVisual}
            title="Break this draft into Higgsfield shot prompts (no API calls, no cost)"
          >
            {visualRunning ? "Generating…" : starting === "visual" ? "Starting…" : "✦ Generate visuals"}
          </button>
          <button
            onClick={() => run("render")}
            disabled={busyRender || promptReady === 0}
            title={
              promptReady === 0
                ? "No shots ready to render — generate visuals first"
                : `Render ${promptReady} ready shot${promptReady === 1 ? "" : "s"} via the Higgsfield API (uses credits)`
            }
          >
            {renderRunning
              ? "Rendering…"
              : starting === "render"
              ? "Starting…"
              : `▶ Render visuals${promptReady ? ` (${promptReady})` : ""}`}
          </button>
          {promptReady === 0 && shots.length === 0 && (
            <span className="muted" style={{ fontSize: 12 }}>
              Generate visuals first
            </span>
          )}
          <div className="spacer" style={{ flex: 1 }} />
          <a className="link" href={row.url} target="_blank" rel="noreferrer" style={{ alignSelf: "center" }}>
            Open in Notion ↗
          </a>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
