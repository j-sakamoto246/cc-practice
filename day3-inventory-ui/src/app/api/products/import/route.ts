import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { importProductsFromCsvText, parseProductCsv } from "@/modules/product-import";

export async function POST(request: Request) {
  await ensureDb();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "リクエスト本文が不正です" }, { status: 400 });
  }

  const csv = (body as { csv?: unknown }).csv;
  if (typeof csv !== "string" || csv.trim() === "") {
    return NextResponse.json({ error: "CSV の内容が空です" }, { status: 400 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  try {
    if (action === "preview") {
      const rows = parseProductCsv(csv);
      return NextResponse.json({ rows });
    }

    const result = await importProductsFromCsvText(csv);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "CSV の処理に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
