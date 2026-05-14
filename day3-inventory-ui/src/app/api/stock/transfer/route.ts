import { NextResponse } from "next/server";

import { InsufficientStockError } from "@/errors/insufficient-stock";
import { ensureDb } from "@/lib/db-init";
import { stockTransfer, type StockTransferInput } from "@/modules/stock";

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseTransferInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await stockTransfer(parsed.value);
    return NextResponse.json({ result }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "倉庫間移動に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseTransferInput(
  raw: unknown,
): { ok: true; value: StockTransferInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;
  const productId = typeof r.product_id === "string" ? r.product_id.trim() : "";
  const fromWarehouseId = typeof r.from_warehouse_id === "string" ? r.from_warehouse_id.trim() : "";
  const toWarehouseId = typeof r.to_warehouse_id === "string" ? r.to_warehouse_id.trim() : "";
  const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
  const memo = typeof r.memo === "string" ? r.memo.trim() : "";

  if (!productId) return { ok: false, error: "商品を選択してください" };
  if (!fromWarehouseId) return { ok: false, error: "移動元倉庫を選択してください" };
  if (!toWarehouseId) return { ok: false, error: "移動先倉庫を選択してください" };
  if (fromWarehouseId === toWarehouseId) {
    return { ok: false, error: "移動元と移動先には異なる倉庫を指定してください" };
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "数量は正の整数で入力してください" };
  }

  const input: StockTransferInput = {
    product_id: productId,
    from_warehouse_id: fromWarehouseId,
    to_warehouse_id: toWarehouseId,
    quantity,
    reference_type: "transfer",
    reference_id: memo,
  };
  return { ok: true, value: input };
}
