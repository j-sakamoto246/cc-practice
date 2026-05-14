import { type NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { generateSalesReport } from "@/modules/accounting";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  await ensureDb();

  const searchParams = request.nextUrl.searchParams;
  const start = searchParams.get("start");
  const end = searchParams.get("end");

  if (!start || !end) {
    return NextResponse.json({ error: "start と end は必須です (YYYY-MM-DD)" }, { status: 400 });
  }
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return NextResponse.json(
      { error: "日付は YYYY-MM-DD 形式で指定してください" },
      { status: 400 },
    );
  }
  if (end < start) {
    return NextResponse.json({ error: "終了日は開始日以降を指定してください" }, { status: 400 });
  }

  try {
    const report = await generateSalesReport(start, end);
    return NextResponse.json({ report });
  } catch (error) {
    const message = error instanceof Error ? error.message : "売上レポートの生成に失敗しました";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
