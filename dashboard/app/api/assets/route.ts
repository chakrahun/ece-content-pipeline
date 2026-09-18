import { NextRequest, NextResponse } from "next/server";
import { DB, queryAll, simplifyPage, assertConfigured } from "@/lib/notion";

export const dynamic = "force-dynamic";

const normId = (s: string) => (s || "").replace(/-/g, "").toLowerCase();

// GET /api/assets?draftId=<notion page id>
// Returns the Content Assets (Higgsfield shots) for one draft, ordered by Order.
export async function GET(req: NextRequest) {
  try {
    assertConfigured();
    const draftId = (req.nextUrl.searchParams.get("draftId") || "").trim();
    const rows = (await queryAll(DB.assets)).map(simplifyPage);
    const filtered = draftId
      ? rows.filter((r) => normId(r.props["Draft ID"] || "") === normId(draftId))
      : rows;
    filtered.sort((a, b) => (a.props.Order ?? 0) - (b.props.Order ?? 0));
    return NextResponse.json({ rows: filtered });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
