import { type NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { getSalesChart } from "@/modules/dashboard";

export async function GET(request: NextRequest) {
  await ensureDb();

  const daysParam = request.nextUrl.searchParams.get("days");
  const parsed = daysParam !== null ? Number(daysParam) : 7;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 90) {
    return NextResponse.json({ error: "days は 1〜90 の数値を指定してください" }, { status: 400 });
  }

  const points = await getSalesChart(Math.floor(parsed));
  return NextResponse.json({ points });
}
