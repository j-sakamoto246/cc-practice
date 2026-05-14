import { NextResponse } from "next/server";

import { InsufficientStockError } from "@/errors/insufficient-stock";
import { ensureDb } from "@/lib/db-init";
import {
  getAllStock,
  listStockMovements,
  listWarehouses,
  stockIn,
  stockOut,
  type StockInInput,
  type StockOutInput,
} from "@/modules/stock";

export async function GET() {
  await ensureDb();
  const [stock, movements, warehouses] = await Promise.all([
    getAllStock(),
    listStockMovements(),
    listWarehouses(),
  ]);
  return NextResponse.json({ stock, movements, warehouses });
}

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseStockInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const movement =
      parsed.value.type === "in"
        ? await stockIn(parsed.value.input)
        : await stockOut(parsed.value.input);
    return NextResponse.json({ movement }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "在庫操作に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseStockInput(
  raw: unknown,
):
  | { ok: true; value: { type: "in"; input: StockInInput } | { type: "out"; input: StockOutInput } }
  | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;
  const type = r.type;
  const productId = typeof r.product_id === "string" ? r.product_id.trim() : "";
  const warehouseId = typeof r.warehouse_id === "string" ? r.warehouse_id.trim() : "";
  const quantity = typeof r.quantity === "number" ? r.quantity : Number(r.quantity);
  const memo = typeof r.memo === "string" ? r.memo.trim() : "";

  if (type !== "in" && type !== "out") {
    return { ok: false, error: "操作タイプが不正です" };
  }
  if (!productId) return { ok: false, error: "商品を選択してください" };
  if (!warehouseId) return { ok: false, error: "倉庫を選択してください" };
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return { ok: false, error: "数量は正の整数で入力してください" };
  }

  const base = {
    product_id: productId,
    warehouse_id: warehouseId,
    quantity,
    reference_type: "manual",
    reference_id: memo,
  };

  if (type === "in") {
    const lotCode = typeof r.lot_code === "string" ? r.lot_code.trim() : "";
    const expiryRaw = typeof r.expiry_date === "string" ? r.expiry_date.trim() : "";
    if (expiryRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expiryRaw)) {
      return { ok: false, error: "有効期限は YYYY-MM-DD 形式で入力してください" };
    }
    const input: StockInInput = {
      ...base,
      ...(lotCode ? { lot_code: lotCode } : {}),
      ...(expiryRaw ? { expiry_date: expiryRaw } : {}),
    };
    return { ok: true, value: { type, input } };
  }
  return { ok: true, value: { type, input: base } };
}
