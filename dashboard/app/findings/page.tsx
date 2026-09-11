"use client";
import { useEffect, useMemo, useState } from "react";
import { Badge, Badges } from "../components/Badge";
import { InlineSelect } from "../components/InlineSelect";
import { ErrorBanner } from "../components/ErrorBanner";
import { TOPICS, FINDING_VERDICTS, FINDING_CONTENT_STATUS } from "@/lib/schema";

export default function FindingsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [topic, setTopic] = useState("All");
  const [verdict, setVerdict] = useState("All");
  const [contentStatus, setContentStatus] = useState("All");
  const [detail, setDetail] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await (await fetch("/api/findings")).json();
        if (d.error) setError(d.error);
        else setRows(d.rows);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const shown = useMemo(() => {
    return rows.filter((r) => {
      const p = r.props;
      if (topic !== "All" && !(p.Topic || []).some((t: any) => t.name === topic)) return false;
      if (verdict !== "All" && p.Verdict?.name !== verdict) return false;
      if (contentStatus !== "All" && p["Content Status"]?.name !== contentStatus) return false;
      if (q) {
        const hay = `${p.Finding || ""} ${p["Source Name"] || ""} ${p["Suggested Framing"] || ""}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, topic, verdict, contentStatus, q]);

  return (
    <div>
      <h1>Findings</h1>
      <p className="subtitle">Fact-checked claims written by the pipeline. Filter, review, and flag what's been used.</p>
      {error && <ErrorBanner message={error} />}

      <div className="toolbar">
        <input placeholder="Search findings…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        <select value={topic} onChange={(e) => setTopic(e.target.value)}>
          <option>All</option>
          {TOPICS.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select value={verdict} onChange={(e) => setVerdict(e.target.value)}>
          <option>All</option>
          {FINDING_VERDICTS.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <select value={contentStatus} onChange={(e) => setContentStatus(e.target.value)}>
          <option>All</option>
          {FINDING_CONTENT_STATUS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <span className="muted">{shown.length} shown</span>
      </div>

      <div className="panel">
        <table>
          <thead>
            <tr>
              <th style={{ width: "36%" }}>Finding</th>
              <th>Topic</th>
              <th>Verdict</th>
              <th>Safe as</th>
              <th>Content status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} style={{ cursor: "pointer" }}>
                <td className="title-cell" onClick={() => setDetail(r)}>
                  {r.props.Finding || <span className="muted">Untitled</span>}
                  <div className="muted" style={{ fontWeight: 400, fontSize: 12, marginTop: 2 }}>
                    {r.props["Source Name"] || "—"}
                  </div>
                </td>
                <td onClick={() => setDetail(r)}>
                  <Badges values={r.props.Topic} />
                </td>
                <td onClick={() => setDetail(r)}>
                  <Badge value={r.props.Verdict} />
                </td>
                <td onClick={() => setDetail(r)}>
                  <Badge value={r.props["Safe To Publish As"]} />
                </td>
                <td>
                  <InlineSelect
                    apiBase="/api/findings"
                    id={r.id}
                    field="Content Status"
                    value={r.props["Content Status"]?.name || null}
                    options={FINDING_CONTENT_STATUS}
                  />
                </td>
              </tr>
            ))}
            {!loading && shown.length === 0 && (
              <tr>
                <td colSpan={5} className="empty">
                  No findings match these filters.
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

      {detail && <FindingDetail row={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field" style={{ marginBottom: 10 }}>
      <label>{label}</label>
      <div>{children}</div>
    </div>
  );
}

function FindingDetail({ row, onClose }: { row: any; onClose: () => void }) {
  const p = row.props;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{p.Finding || "Finding"}</h2>
        <div className="badges" style={{ marginBottom: 16 }}>
          <Badge value={p.Verdict} />
          <Badge value={p["Safe To Publish As"]} />
          <Badge value={p["Source Tier"]} />
          <Badge value={p["Source Type"]} />
          <Badge value={p.Novelty} />
        </div>
        {p.Topic?.length > 0 && (
          <Row label="Topic">
            <Badges values={p.Topic} />
          </Row>
        )}
        {p["Raw Excerpt"] && <Row label="Raw excerpt">“{p["Raw Excerpt"]}”</Row>}
        {p["Suggested Framing"] && <Row label="Suggested framing">{p["Suggested Framing"]}</Row>}
        {p.Caveats && <Row label="Caveats">{p.Caveats}</Row>}
        {p["Verification Notes"] && <Row label="Verification notes">{p["Verification Notes"]}</Row>}
        {p["Contradicting Sources"] && <Row label="Contradicting sources">{p["Contradicting Sources"]}</Row>}
        <Row label="Source">
          {p["Source Name"] || "—"}
          {p["Author Credential"] ? ` · ${p["Author Credential"]}` : ""}
          {p["Sample Size Or Scale"] ? ` · n=${p["Sample Size Or Scale"]}` : ""}
        </Row>
        {p["Source URL"] && (
          <Row label="Source URL">
            <a className="link" href={p["Source URL"]} target="_blank" rel="noreferrer">
              {p["Source URL"]}
            </a>
          </Row>
        )}
        <Row label="Flags">
          {p["Contradicts Mainstream Guidance"] ? "⚠ Contradicts mainstream guidance  " : ""}
          {p["Financial Interest Flag"] ? "⚠ Financial interest" : ""}
          {!p["Contradicts Mainstream Guidance"] && !p["Financial Interest Flag"] ? "None" : ""}
        </Row>
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
