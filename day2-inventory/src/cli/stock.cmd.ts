import { Command } from "commander";
import {
  stockIn,
  stockOut,
  getStockStatus,
  getWarehouseByName,
  getAllStock,
  getStockAlerts,
} from "../modules/stock.js";
import { getProductBySku, setMinQuantity } from "../modules/product.js";
import { formatTable } from "../utils/formatter.js";

export async function resolveProductAndWarehouse(sku: string, warehouseName: string) {
  const product = await getProductBySku(sku);
  if (!product) {
    console.error(`商品が見つかりません: SKU=${sku}`);
    process.exitCode = 1;
    return null;
  }
  const warehouse = await getWarehouseByName(warehouseName);
  if (!warehouse) {
    console.error(`倉庫が見つかりません: ${warehouseName}`);
    process.exitCode = 1;
    return null;
  }
  return { product, warehouse };
}

export function registerStockCommands(parent: Command) {
  const cmd = parent.command("stock").description("在庫管理");

  cmd
    .command("in")
    .description("入庫")
    .requiredOption("--sku <sku>", "商品SKU")
    .requiredOption("--quantity <qty>", "数量", parseInt)
    .requiredOption("--warehouse <name>", "倉庫名")
    .option("--note <note>", "備考", "")
    .action(async (opts: { sku: string; quantity: number; warehouse: string; note: string }) => {
      const resolved = await resolveProductAndWarehouse(opts.sku, opts.warehouse);
      if (!resolved) return;
      const movement = await stockIn({
        product_id: resolved.product.id,
        warehouse_id: resolved.warehouse.id,
        quantity: opts.quantity,
        reference_type: opts.note ? "manual" : "",
        reference_id: opts.note,
      });
      console.log(
        `入庫しました: ${opts.sku} x ${movement.quantity} → ${opts.warehouse}`,
      );
    });

  cmd
    .command("out")
    .description("出庫")
    .requiredOption("--sku <sku>", "商品SKU")
    .requiredOption("--quantity <qty>", "数量", parseInt)
    .requiredOption("--warehouse <name>", "倉庫名")
    .option("--note <note>", "備考", "")
    .action(async (opts: { sku: string; quantity: number; warehouse: string; note: string }) => {
      const resolved = await resolveProductAndWarehouse(opts.sku, opts.warehouse);
      if (!resolved) return;
      const movement = await stockOut({
        product_id: resolved.product.id,
        warehouse_id: resolved.warehouse.id,
        quantity: opts.quantity,
        reference_type: opts.note ? "manual" : "",
        reference_id: opts.note,
      });
      console.log(
        `出庫しました: ${opts.sku} x ${movement.quantity} ← ${opts.warehouse}`,
      );
    });

  cmd
    .command("status")
    .description("在庫状況")
    .option("--sku <sku>", "商品SKU で絞り込み")
    .option("--warehouse <name>", "倉庫名で絞り込み")
    .action(async (opts: { sku?: string; warehouse?: string }) => {
      if (opts.sku && opts.warehouse) {
        const resolved = await resolveProductAndWarehouse(opts.sku, opts.warehouse);
        if (!resolved) return;
        const status = await getStockStatus(resolved.product.id, resolved.warehouse.id);
        console.log(
          formatTable(
            ["SKU", "商品名", "倉庫", "数量"],
            [[opts.sku, resolved.product.name, opts.warehouse, String(status.quantity)]],
          ),
        );
        return;
      }

      const allStock = await getAllStock();
      const filtered = allStock.filter((s) => {
        if (opts.sku && s.sku !== opts.sku) return false;
        if (opts.warehouse && s.warehouse_name !== opts.warehouse) return false;
        return true;
      });

      if (filtered.length === 0) {
        console.log("在庫がありません");
        return;
      }

      console.log(
        formatTable(
          ["SKU", "商品名", "倉庫", "数量"],
          filtered.map((s) => [s.sku, s.product_name, s.warehouse_name, String(s.quantity)]),
        ),
      );
    });

  cmd
    .command("set-threshold")
    .description("最低在庫数（発注閾値）を設定")
    .requiredOption("--sku <sku>", "商品SKU")
    .requiredOption("--min <qty>", "最低在庫数", parseInt)
    .action(async (opts: { sku: string; min: number }) => {
      try {
        const product = await setMinQuantity(opts.sku, opts.min);
        console.log(
          `最低在庫数を設定しました: ${product.sku} → ${product.min_quantity}`,
        );
      } catch (err) {
        console.error((err as Error).message);
        process.exitCode = 1;
      }
    });

  cmd
    .command("alerts")
    .description("最低在庫を下回っている商品を表示")
    .action(async () => {
      const alerts = await getStockAlerts();
      if (alerts.length === 0) {
        console.log("アラート対象の在庫はありません");
        return;
      }
      for (const a of alerts) {
        console.log(
          `${a.sku}: 現在在庫 ${a.total_quantity} / 最低在庫 ${a.min_quantity} - 要発注`,
        );
      }
    });
}
