import { ensureDb } from "@/lib/db-init";
import { listOrderDetails } from "@/modules/order";
import { listProducts } from "@/modules/product";

import { OrdersClient } from "./orders-client";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  await ensureDb();
  const [orders, products] = await Promise.all([listOrderDetails(), listProducts()]);

  return (
    <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">受注管理</h1>
        <p className="text-muted-foreground text-sm">受注の登録、確認、発送処理を行います。</p>
      </header>

      <OrdersClient initialOrders={orders} products={products} />
    </main>
  );
}
