import { NextResponse } from "next/server";
import { DB, queryAll, simplifyPage, assertConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

function tally(rows: any[], prop: string) {
  const counts: Record<string, number> = {};
  for (const r of rows) {
    const v = r.props[prop];
    const key = v && typeof v === "object" ? v.name : v || "—";
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

export async function GET() {
  try {
    assertConfigured();
    const [queue, findings, drafts] = await Promise.all([
      queryAll(DB.queue),
      queryAll(DB.findings),
      queryAll(DB.drafts),
    ]);
    const q = queue.map(simplifyPage);
    const f = findings.map(simplifyPage);
    const d = drafts.map(simplifyPage);
    return NextResponse.json({
      queue: { total: q.length, byStatus: tally(q, "Status"), byPriority: tally(q, "Priority") },
      findings: {
        total: f.length,
        byVerdict: tally(f, "Verdict"),
        byContentStatus: tally(f, "Content Status"),
      },
      drafts: { total: d.length, byStatus: tally(d, "Status") },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
