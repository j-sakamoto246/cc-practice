import { ensureDb } from "@/lib/db-init";
import { listProducts } from "@/modules/product";
import { listWarehouses } from "@/modules/stock";

import { ForecastClient } from "./forecast-client";

export const dynamic = "force-dynamic";

export default async function ForecastPage() {
  await ensureDb();
  const [products, warehouses] = await Promise.all([listProducts(), listWarehouses()]);

  return (
    <main className="container mx-auto flex flex-1 flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">需要予測 / 発注推奨</h1>
        <p className="text-muted-foreground text-sm">
          過去の出庫実績を元に、安全在庫・発注点・推奨発注量を計算します。
        </p>
      </header>
      <ForecastClient products={products} warehouses={warehouses} />
    </main>
  );
}
