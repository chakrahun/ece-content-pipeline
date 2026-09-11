import { NextResponse } from "next/server";
import { DB, queryAll, simplifyPage, assertConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertConfigured();
    const rows = await queryAll(DB.findings, [
      { timestamp: "created_time", direction: "descending" },
    ]);
    return NextResponse.json({ rows: rows.map(simplifyPage) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
