import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { calculateInventoryValue, exportToCSV } from "@/modules/accounting";

const BOM = "﻿";

export async function GET() {
  await ensureDb();

  try {
    const valuation = await calculateInventoryValue();
    const csv = exportToCSV(
      ["sku", "product_name", "cost", "total_quantity", "total_value"],
      valuation.items.map((item) => [
        item.sku,
        item.product_name,
        item.cost,
        item.total_quantity,
        item.total_value,
      ]),
    );

    const today = new Date().toISOString().slice(0, 10);
    return new NextResponse(BOM + csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="inventory-${today}.csv"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV の生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
