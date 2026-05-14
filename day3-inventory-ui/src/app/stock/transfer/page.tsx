import { ensureDb } from "@/lib/db-init";
import { listProducts } from "@/modules/product";
import { getAllStock, listWarehouses } from "@/modules/stock";

import { TransferClient } from "./transfer-client";

export const dynamic = "force-dynamic";

export default async function StockTransferPage() {
  await ensureDb();
  const [products, warehouses, stock] = await Promise.all([
    listProducts(),
    listWarehouses(),
    getAllStock(),
  ]);

  return <TransferClient products={products} warehouses={warehouses} initialStock={stock} />;
}
