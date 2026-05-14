import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { forecastProducts, type ForecastInput } from "@/modules/forecast";

const ALLOWED_CONFIDENCE = [0.8, 0.85, 0.9, 0.95, 0.99];

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseForecastInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const forecasts = await forecastProducts(parsed.value);
    return NextResponse.json({ forecasts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "需要予測の計算に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseForecastInput(
  raw: unknown,
): { ok: true; value: ForecastInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;

  const sku = typeof r.sku === "string" && r.sku.trim() !== "" ? r.sku.trim() : undefined;
  const warehouseId =
    typeof r.warehouseId === "string" && r.warehouseId.trim() !== ""
      ? r.warehouseId.trim()
      : undefined;
  const days = typeof r.days === "number" ? r.days : Number(r.days);
  const confidence = typeof r.confidence === "number" ? r.confidence : Number(r.confidence);
  const orderCost = typeof r.orderCost === "number" ? r.orderCost : Number(r.orderCost);
  const holdingRate = typeof r.holdingRate === "number" ? r.holdingRate : Number(r.holdingRate);

  if (!Number.isInteger(days) || days <= 0) {
    return { ok: false, error: "集計日数は 1 以上の整数を指定してください" };
  }
  if (!Number.isFinite(confidence) || !ALLOWED_CONFIDENCE.includes(Number(confidence.toFixed(2)))) {
    return {
      ok: false,
      error: "信頼水準は 0.80 / 0.85 / 0.90 / 0.95 / 0.99 のいずれかを指定してください",
    };
  }
  if (!Number.isFinite(orderCost) || orderCost < 0) {
    return { ok: false, error: "発注コストは 0 以上の数値を指定してください" };
  }
  if (!Number.isFinite(holdingRate) || holdingRate < 0) {
    return { ok: false, error: "保管費率は 0 以上の数値を指定してください" };
  }

  return {
    ok: true,
    value: {
      sku,
      warehouseId,
      days,
      confidence,
      orderCost,
      holdingRate,
    },
  };
}
