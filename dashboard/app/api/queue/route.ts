import { NextRequest, NextResponse } from "next/server";
import { DB, notion, queryAll, simplifyPage, buildProp, assertConfigured } from "@/lib/notion";
import { WRITE_TYPES } from "@/lib/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    assertConfigured();
    const rows = await queryAll(DB.queue, [{ timestamp: "created_time", direction: "descending" }]);
    return NextResponse.json({ rows: rows.map(simplifyPage) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}

// Add a new topic to the queue.
export async function POST(req: NextRequest) {
  try {
    assertConfigured();
    const body = await req.json();
    if (!body.Topic || !String(body.Topic).trim()) {
      return NextResponse.json({ error: "Topic is required." }, { status: 400 });
    }
    const types = WRITE_TYPES.queue;
    const properties: Record<string, any> = {
      Topic: buildProp(types.Topic, body.Topic),
      Status: buildProp(types.Status, body.Status || "Queued"),
    };
    if (body.Priority) properties.Priority = buildProp(types.Priority, body.Priority);
    if (body["Angle Or Notes"])
      properties["Angle Or Notes"] = buildProp(types["Angle Or Notes"], body["Angle Or Notes"]);
    properties["Requested By"] = buildProp(types["Requested By"], "dashboard");
    properties["Added Date"] = { date: { start: new Date().toISOString().slice(0, 10) } };

    const page: any = await notion.pages.create({
      parent: { database_id: DB.queue },
      properties,
    });
    return NextResponse.json({ row: simplifyPage(page) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
