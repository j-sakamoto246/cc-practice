import { type NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { getExpiringLots } from "@/modules/stock";

export async function GET(request: NextRequest) {
  await ensureDb();

  const daysParam = request.nextUrl.searchParams.get("days");
  let daysAhead = 30;
  if (daysParam !== null) {
    const parsed = Number(daysParam);
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
      return NextResponse.json(
        { error: "days は 0 以上の整数を指定してください" },
        { status: 400 },
      );
    }
    daysAhead = parsed;
  }

  try {
    const lots = await getExpiringLots(daysAhead);
    return NextResponse.json({ lots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "期限間近ロットの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
