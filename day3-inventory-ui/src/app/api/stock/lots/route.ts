import { type NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { listLots, type ListLotsFilter } from "@/modules/stock";

export async function GET(request: NextRequest) {
  await ensureDb();

  const searchParams = request.nextUrl.searchParams;
  const filter: ListLotsFilter = {};

  const productId = searchParams.get("product_id");
  if (productId) filter.product_id = productId;

  const warehouseId = searchParams.get("warehouse_id");
  if (warehouseId) filter.warehouse_id = warehouseId;

  const includeEmpty = searchParams.get("include_empty");
  if (includeEmpty === "true") filter.include_empty = true;

  try {
    const lots = await listLots(filter);
    return NextResponse.json({ lots });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ロット一覧の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
