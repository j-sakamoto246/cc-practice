import { NextResponse } from "next/server";

import { InsufficientStockError } from "@/errors/insufficient-stock";
import { ensureDb } from "@/lib/db-init";
import { createOrder, listOrderDetails, type CreateOrderInput } from "@/modules/order";

export async function GET() {
  await ensureDb();
  const orders = await listOrderDetails();
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseCreateOrder(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const order = await createOrder(parsed.value);
    return NextResponse.json({ order }, { status: 201 });
  } catch (error) {
    if (error instanceof InsufficientStockError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "受注の作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseCreateOrder(
  raw: unknown,
): { ok: true; value: CreateOrderInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;
  const customerName = typeof r.customer_name === "string" ? r.customer_name.trim() : "";
  const itemsRaw = Array.isArray(r.items) ? r.items : [];

  if (!customerName) return { ok: false, error: "顧客名を入力してください" };
  if (itemsRaw.length === 0) return { ok: false, error: "商品を1件以上選択してください" };

  const items = [];
  for (const item of itemsRaw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "明細が不正です" };
    }
    const row = item as Record<string, unknown>;
    const productId = typeof row.product_id === "string" ? row.product_id.trim() : "";
    const quantity = typeof row.quantity === "number" ? row.quantity : Number(row.quantity);
    const unitPrice = typeof row.unit_price === "number" ? row.unit_price : Number(row.unit_price);

    if (!productId) return { ok: false, error: "商品を選択してください" };
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, error: "数量は正の整数で入力してください" };
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      return { ok: false, error: "単価が不正です" };
    }
    items.push({ product_id: productId, quantity, unit_price: unitPrice });
  }

  return { ok: true, value: { customer_name: customerName, items } };
}
