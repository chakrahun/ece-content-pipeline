import { NextRequest, NextResponse } from "next/server";
import { notion, simplifyPage, buildProp, assertConfigured } from "@/lib/notion";
import { WRITE_TYPES } from "@/lib/schema";

export const dynamic = "force-dynamic";

// Update editable fields on a queue row (Status, Priority, Angle Or Notes, Topic).
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertConfigured();
    const { id } = await ctx.params;
    const body = await req.json();
    const types = WRITE_TYPES.queue;
    const properties: Record<string, any> = {};
    for (const [key, value] of Object.entries(body)) {
      if (types[key]) properties[key] = buildProp(types[key], value);
    }
    if (Object.keys(properties).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }
    const page: any = await notion.pages.update({ page_id: id, properties });
    return NextResponse.json({ row: simplifyPage(page) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 });
  }
}
