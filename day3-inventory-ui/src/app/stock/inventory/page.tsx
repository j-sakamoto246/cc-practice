import { ensureDb } from "@/lib/db-init";
import { listProducts } from "@/modules/product";
import { getAllStock, listWarehouses } from "@/modules/stock";

import { InventoryClient } from "./inventory-client";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  await ensureDb();
  const [products, warehouses, stock] = await Promise.all([
    listProducts(),
    listWarehouses(),
    getAllStock(),
  ]);

  return <InventoryClient products={products} warehouses={warehouses} stock={stock} />;
}
