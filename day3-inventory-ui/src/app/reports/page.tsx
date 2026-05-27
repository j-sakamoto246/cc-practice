import { ensureDb } from "@/lib/db-init";
import { Profiler } from "@/lib/profiler";
import { calculateInventoryValue } from "@/modules/accounting";

import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await ensureDb();
  const valuation = await calculateInventoryValue();

  return (
    <main id="main-content" className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">レポート</h1>
        <p className="text-muted-foreground text-sm">
          売上・在庫評価の集計と、CSV ダウンロードを行います。
        </p>
      </header>
      <Profiler id="ReportsClient">
        <ReportsClient initialValuation={valuation} />
      </Profiler>
    </main>
  );
}
