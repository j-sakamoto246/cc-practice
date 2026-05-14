import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { calculateInventoryValue } from "@/modules/accounting";

export async function GET() {
  await ensureDb();

  try {
    const valuation = await calculateInventoryValue();
    return NextResponse.json({ valuation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "在庫評価の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
