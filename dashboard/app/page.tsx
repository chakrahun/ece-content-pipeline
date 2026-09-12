"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ErrorBanner } from "./components/ErrorBanner";

function Breakdown({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  return (
    <div className="breakdown">
      {entries.map(([k, n]) => (
        <div className="row" key={k}>
          <span className="n">{k}</span>
          <span>{n}</span>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/overview")
      .then((r) => r.json())
      .then((d) => (d.error ? setError(d.error) : setData(d)))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <div>
      <h1>Overview</h1>
      <p className="subtitle">Live snapshot of your content pipeline, straight from Notion.</p>
      {error && <ErrorBanner message={error} />}
      {!data && !error && <p className="muted">Loading…</p>}
      {data && (
        <div className="cards">
          <Link href="/queue" className="card" style={{ textDecoration: "none" }}>
            <div className="k">Topic Queue</div>
            <div className="v">{data.queue.total}</div>
            <Breakdown data={data.queue.byStatus} />
          </Link>
          <Link href="/findings" className="card" style={{ textDecoration: "none" }}>
            <div className="k">Findings · by verdict</div>
            <div className="v">{data.findings.total}</div>
            <Breakdown data={data.findings.byVerdict} />
          </Link>
          <Link href="/findings" className="card" style={{ textDecoration: "none" }}>
            <div className="k">Findings · content status</div>
            <div className="v">{data.findings.total}</div>
            <Breakdown data={data.findings.byContentStatus} />
          </Link>
          <Link href="/ideas" className="card" style={{ textDecoration: "none" }}>
            <div className="k">Ideas · by status</div>
            <div className="v">{data.ideas?.total ?? 0}</div>
            {data.ideas?.configured === false ? (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                Connect the Content Ideas DB to your integration to enable.
              </div>
            ) : (
              <Breakdown data={data.ideas?.byStatus || {}} />
            )}
          </Link>
          <Link href="/drafts" className="card" style={{ textDecoration: "none" }}>
            <div className="k">Drafts</div>
            <div className="v">{data.drafts.total}</div>
            <Breakdown data={data.drafts.byStatus} />
          </Link>
        </div>
      )}
    </div>
  );
}
