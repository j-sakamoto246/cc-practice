import { type NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { getRecentMovements } from "@/modules/dashboard";

export async function GET(request: NextRequest) {
  await ensureDb();

  const limitParam = request.nextUrl.searchParams.get("limit");
  const parsed = limitParam !== null ? Number(limitParam) : 10;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 100) {
    return NextResponse.json(
      { error: "limit は 1〜100 の数値を指定してください" },
      { status: 400 },
    );
  }

  const movements = await getRecentMovements(Math.floor(parsed));
  return NextResponse.json({ movements });
}
