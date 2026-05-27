import { ensureDb } from "@/lib/db-init";
import { listCampaigns } from "@/modules/campaign";
import { listOrders } from "@/modules/order";

import { CampaignsClient } from "./campaigns-client";

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  await ensureDb();
  const [campaigns, orders] = await Promise.all([listCampaigns(), listOrders()]);

  return (
    <main id="main-content" className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">キャンペーン管理</h1>
        <p className="text-muted-foreground text-sm">
          キャンペーンの作成・一覧・受注への適用を行います。
        </p>
      </header>

      <CampaignsClient initialCampaigns={campaigns} initialOrders={orders} />
    </main>
  );
}
