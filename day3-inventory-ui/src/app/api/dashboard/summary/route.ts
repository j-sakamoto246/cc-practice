import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { getDashboardSummary } from "@/modules/dashboard";

export async function GET() {
  await ensureDb();
  const summary = await getDashboardSummary();
  return NextResponse.json({ summary });
}
