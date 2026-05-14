import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { addProduct, listProducts, type AddProductInput } from "@/modules/product";

export async function GET() {
  await ensureDb();
  const products = await listProducts();
  return NextResponse.json({ products });
}

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseAddInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const product = await addProduct(parsed.value);
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "商品の追加に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseAddInput(
  raw: unknown,
): { ok: true; value: AddProductInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;

  const sku = typeof r.sku === "string" ? r.sku.trim() : "";
  const name = typeof r.name === "string" ? r.name.trim() : "";
  const description = typeof r.description === "string" ? r.description : undefined;
  const price = typeof r.price === "number" ? r.price : Number(r.price);
  const cost = typeof r.cost === "number" ? r.cost : Number(r.cost);
  const minQuantity =
    r.minQuantity === undefined || r.minQuantity === "" ? undefined : Number(r.minQuantity);

  if (!sku) return { ok: false, error: "SKU は必須です" };
  if (!name) return { ok: false, error: "商品名は必須です" };
  if (!Number.isFinite(price) || price < 0)
    return { ok: false, error: "価格は 0 以上の数値を指定してください" };
  if (!Number.isFinite(cost) || cost < 0)
    return { ok: false, error: "原価は 0 以上の数値を指定してください" };
  if (minQuantity !== undefined && (!Number.isFinite(minQuantity) || minQuantity < 0))
    return { ok: false, error: "最低在庫数は 0 以上の数値を指定してください" };

  return { ok: true, value: { sku, name, description, price, cost, minQuantity } };
}
