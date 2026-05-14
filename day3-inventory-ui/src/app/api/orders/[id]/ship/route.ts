import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { shipOrder } from "@/modules/order";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  await ensureDb();
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const r = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const carrier = typeof r.carrier === "string" ? r.carrier.trim() : "";
  const trackingNumber = typeof r.tracking_number === "string" ? r.tracking_number.trim() : "";

  if (!carrier) return NextResponse.json({ error: "配送業者を選択してください" }, { status: 400 });
  if (!trackingNumber) {
    return NextResponse.json({ error: "追跡番号を入力してください" }, { status: 400 });
  }

  try {
    const shipment = await shipOrder(id, carrier, trackingNumber);
    return NextResponse.json({ shipment }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "発送処理に失敗しました";
    const status = message.includes("見つかりません") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
