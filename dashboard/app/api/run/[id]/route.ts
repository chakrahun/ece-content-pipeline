import { NextRequest, NextResponse } from "next/server";
import { getJob } from "@/lib/runner";

export const dynamic = "force-dynamic";

// Fetch one run's status + log (for the detail view).
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const found = getJob(id);
  if (!found) return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json(found);
}
