import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { deleteProduct, updateProduct, type UpdateProductInput } from "@/modules/product";

type RouteContext = { params: Promise<{ id: string }> };

export async function PUT(request: Request, context: RouteContext) {
  await ensureDb();
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseUpdateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const product = await updateProduct(id, parsed.value);
    return NextResponse.json({ product });
  } catch (error) {
    const message = error instanceof Error ? error.message : "商品の更新に失敗しました";
    const status = message.includes("見つかりません") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  await ensureDb();
  const { id } = await context.params;

  try {
    await deleteProduct(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "商品の削除に失敗しました";
    const status = message.includes("見つかりません") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

function parseUpdateInput(
  raw: unknown,
): { ok: true; value: UpdateProductInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;
  const value: UpdateProductInput = {};

  if (r.name !== undefined) {
    if (typeof r.name !== "string" || r.name.trim() === "") {
      return { ok: false, error: "商品名が不正です" };
    }
    value.name = r.name.trim();
  }
  if (r.description !== undefined) {
    if (typeof r.description !== "string") {
      return { ok: false, error: "説明が不正です" };
    }
    value.description = r.description;
  }
  if (r.price !== undefined) {
    const price = typeof r.price === "number" ? r.price : Number(r.price);
    if (!Number.isFinite(price) || price < 0) {
      return { ok: false, error: "価格は 0 以上の数値を指定してください" };
    }
    value.price = price;
  }
  if (r.cost !== undefined) {
    const cost = typeof r.cost === "number" ? r.cost : Number(r.cost);
    if (!Number.isFinite(cost) || cost < 0) {
      return { ok: false, error: "原価は 0 以上の数値を指定してください" };
    }
    value.cost = cost;
  }
  if (r.minQuantity !== undefined) {
    const min = typeof r.minQuantity === "number" ? r.minQuantity : Number(r.minQuantity);
    if (!Number.isInteger(min) || min < 0) {
      return { ok: false, error: "最低在庫数は 0 以上の整数を指定してください" };
    }
    value.minQuantity = min;
  }
  if (r.leadTimeDays !== undefined) {
    const lead = typeof r.leadTimeDays === "number" ? r.leadTimeDays : Number(r.leadTimeDays);
    if (!Number.isInteger(lead) || lead < 0) {
      return { ok: false, error: "リードタイムは 0 以上の整数を指定してください" };
    }
    value.leadTimeDays = lead;
  }

  if (Object.keys(value).length === 0) {
    return { ok: false, error: "更新する項目がありません" };
  }
  return { ok: true, value };
}
