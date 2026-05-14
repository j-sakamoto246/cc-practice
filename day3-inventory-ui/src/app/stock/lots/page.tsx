import { ensureDb } from "@/lib/db-init";
import { listProducts } from "@/modules/product";
import { listLots, listWarehouses } from "@/modules/stock";

import { LotsClient } from "./lots-client";

export const dynamic = "force-dynamic";

export default async function LotsPage() {
  await ensureDb();
  const [lots, products, warehouses] = await Promise.all([
    listLots(),
    listProducts(),
    listWarehouses(),
  ]);

  return <LotsClient initialLots={lots} products={products} warehouses={warehouses} />;
}
