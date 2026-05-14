import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { getOrderDetail, updateOrderStatus } from "@/modules/order";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  await ensureDb();
  const { id } = await context.params;
  const order = await getOrderDetail(id);
  if (!order) {
    return NextResponse.json({ error: "受注が見つかりません" }, { status: 404 });
  }
  return NextResponse.json({ order });
}

export async function PATCH(request: Request, context: RouteContext) {
  await ensureDb();
  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const status =
    body && typeof body === "object" && typeof (body as Record<string, unknown>).status === "string"
      ? ((body as Record<string, unknown>).status as string)
      : "";
  if (!status) {
    return NextResponse.json({ error: "ステータスを指定してください" }, { status: 400 });
  }

  try {
    const order = await updateOrderStatus(id, status);
    return NextResponse.json({ order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ステータス変更に失敗しました";
    const statusCode = message.includes("見つかりません") ? 404 : 400;
    return NextResponse.json({ error: message }, { status: statusCode });
  }
}
