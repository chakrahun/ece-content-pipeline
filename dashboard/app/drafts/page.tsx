"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Badges } from "../components/Badge";
import { InlineSelect } from "../components/InlineSelect";
import { ErrorBanner } from "../components/ErrorBanner";
import { DRAFT_STATUS } from "@/lib/schema";

export default function DraftsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("All");
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch("/api/drafts")).json();
        if (d.error) setError(d.error);
        else setRows(d.rows);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shown = useMemo(
    () => rows.filter((r) => status === "All" || r.props.Status?.name === status),
    [rows, status]
  );

  return (
    <div>
      <h1>Drafts</h1>
      <p className="subtitle">Scripts written from verified findings. Read the body, then set the review status.</p>
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

      {detail && <DraftDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function DraftDetail({ row, onClose }: { row: any; onClose: () => void }) {
  const p = row.props;
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
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 12 }}>
          <a className="link" href={row.url} target="_blank" rel="noreferrer" style={{ alignSelf: "center" }}>
            Open in Notion ↗
          </a>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
