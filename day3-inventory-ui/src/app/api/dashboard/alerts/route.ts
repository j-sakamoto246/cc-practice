import { NextResponse } from "next/server";

import { ensureDb } from "@/lib/db-init";
import { getStockAlerts } from "@/modules/stock";

export async function GET() {
  await ensureDb();
  const alerts = await getStockAlerts();
  return NextResponse.json({ alerts });
}
