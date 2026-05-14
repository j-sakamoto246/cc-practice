import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { applyCampaign } from "@/modules/campaign";

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const result = await applyCampaign(parsed.value.order_id, parsed.value.campaign_id);
    return NextResponse.json({ result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "キャンペーンの適用に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

function parseInput(
  raw: unknown,
): { ok: true; value: { order_id: string; campaign_id: string } } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;
  const orderId = typeof r.order_id === "string" ? r.order_id.trim() : "";
  const campaignId = typeof r.campaign_id === "string" ? r.campaign_id.trim() : "";
  if (!orderId) return { ok: false, error: "受注IDは必須です" };
  if (!campaignId) return { ok: false, error: "キャンペーンIDは必須です" };
  return { ok: true, value: { order_id: orderId, campaign_id: campaignId } };
}
