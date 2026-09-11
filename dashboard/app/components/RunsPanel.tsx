"use client";
import { useEffect, useState } from "react";

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  running: { bg: "rgba(51,126,169,0.2)", fg: "#3277a4", label: "running" },
  done: { bg: "rgba(68,131,97,0.22)", fg: "#3f7a5a", label: "done" },
  error: { bg: "rgba(212,76,71,0.2)", fg: "#d44c47", label: "failed" },
};

function elapsed(a: string, b?: string) {
  const ms = (b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function RunsPanel({ jobs }: { jobs: any[] }) {
  const [viewing, setViewing] = useState<string | null>(null);
  if (!jobs || jobs.length === 0) return null;

  return (
    <div style={{ marginTop: 28 }}>
      <h2>Pipeline runs</h2>
      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "44%" }}>Topic</th>
              <th>Status</th>
              <th>Started</th>
              <th>Duration</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => {
              const st = STATUS_STYLE[j.status] || STATUS_STYLE.done;
              return (
                <tr key={j.id}>
                  <td className="title-cell" style={{ fontWeight: 500 }}>
                    {j.topic}
                    {j.summary && j.status !== "running" && (
                      <div className="muted" style={{ fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                        {j.summary}
                      </div>
                    )}
                  </td>
                  <td>
                    <span className="badge" style={{ background: st.bg, color: st.fg }}>
                      {st.label}
                    </span>
                  </td>
                  <td className="muted">{new Date(j.startedAt).toLocaleString()}</td>
                  <td className="muted">{elapsed(j.startedAt, j.endedAt)}</td>
                  <td>
                    <button className="secondary" style={{ padding: "4px 10px", fontSize: 12 }} onClick={() => setViewing(j.id)}>
                      View log
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {viewing && <RunLog id={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function RunLog({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    let alive = true;
    async function tick() {
      try {
        const d = await (await fetch(`/api/run/${id}`)).json();
        if (!alive) return;
        setData(d);
        if (d.job?.status === "running") setTimeout(tick, 3000);
      } catch {}
    }
    tick();
    return () => {
      alive = false;
    };
  }, [id]);

  const job = data?.job;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Run log</h2>
        {job && (
          <p className="muted" style={{ marginTop: 0 }}>
            {job.topic} · {job.status}
            {job.status === "running" ? " (updating live…)" : ""}
          </p>
        )}
        <div className="script-body" style={{ maxHeight: "50vh", overflow: "auto" }}>
          {data ? data.log || "(no output yet)" : "Loading…"}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
