import { Command } from "commander";
import {
  stockIn,
  stockOut,
  getStockStatus,
  getWarehouseByName,
  getAllStock,
} from "../modules/stock.js";
import { getProductBySku } from "../modules/product.js";
import { formatTable } from "../utils/formatter.js";

async function resolveProductAndWarehouse(sku: string, warehouseName: string) {
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
}
