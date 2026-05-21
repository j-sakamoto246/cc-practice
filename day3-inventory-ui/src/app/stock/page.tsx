import { ensureDb } from "@/lib/db-init";
import { Profiler } from "@/lib/profiler";
import { listProducts } from "@/modules/product";
import { getAllStock, listStockMovements, listWarehouses } from "@/modules/stock";

import { StockClient } from "./stock-client";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  await ensureDb();
  const [products, warehouses, stock, movements] = await Promise.all([
    listProducts(),
    listWarehouses(),
    getAllStock(),
    listStockMovements(),
  ]);

  return (
    <Profiler id="StockClient">
      <StockClient
        products={products}
        warehouses={warehouses}
        initialStock={stock}
        initialMovements={movements}
      />
    </Profiler>
  );
}
