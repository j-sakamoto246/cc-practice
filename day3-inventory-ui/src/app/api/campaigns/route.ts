import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { createCampaign, listCampaigns, type CreateCampaignInput } from "@/modules/campaign";

export async function GET() {
  await ensureDb();
  const campaigns = await listCampaigns();
  return NextResponse.json({ campaigns });
}

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const parsed = parseCreateInput(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const campaign = await createCampaign(parsed.value);
    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "キャンペーンの作成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseCreateInput(
  raw: unknown,
): { ok: true; value: CreateCampaignInput } | { ok: false; error: string } {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "リクエスト本文が不正です" };
  }
  const r = raw as Record<string, unknown>;

  const name = typeof r.name === "string" ? r.name.trim() : "";
  const discountType = r.discount_type;
  const discountValue =
    typeof r.discount_value === "number" ? r.discount_value : Number(r.discount_value);
  const startDate = typeof r.start_date === "string" ? r.start_date : "";
  const endDate = typeof r.end_date === "string" ? r.end_date : "";

  if (!name) return { ok: false, error: "キャンペーン名は必須です" };
  if (discountType !== "percentage" && discountType !== "fixed") {
    return { ok: false, error: "割引タイプは percentage または fixed を指定してください" };
  }
  if (!Number.isFinite(discountValue) || discountValue <= 0) {
    return { ok: false, error: "割引値は0より大きい値を指定してください" };
  }
  if (discountType === "percentage" && discountValue > 100) {
    return { ok: false, error: "割引率は100以下を指定してください" };
  }
  if (!DATE_RE.test(startDate)) {
    return { ok: false, error: "開始日は YYYY-MM-DD 形式で指定してください" };
  }
  if (!DATE_RE.test(endDate)) {
    return { ok: false, error: "終了日は YYYY-MM-DD 形式で指定してください" };
  }
  if (endDate < startDate) {
    return { ok: false, error: "終了日は開始日以降を指定してください" };
  }

  return {
    ok: true,
    value: {
      name,
      discount_type: discountType,
      discount_value: discountValue,
      start_date: startDate,
      end_date: endDate,
    },
  };
}
