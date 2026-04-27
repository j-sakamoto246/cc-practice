import { Command } from "commander";
import {
  stockIn,
  stockOut,
  stockTransfer,
  getStockStatus,
  getWarehouseByName,
  getAllStock,
  getStockAlerts,
  listLots,
  getExpiringLots,
} from "../modules/stock.js";
import { getProductBySku, setMinQuantity } from "../modules/product.js";
import { formatTable } from "../utils/formatter.js";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

export async function resolveProductAndWarehouses(
  sku: string,
  fromWarehouseName: string,
  toWarehouseName: string,
) {
  const product = await getProductBySku(sku);
  if (!product) {
    console.error(`商品が見つかりません: SKU=${sku}`);
    process.exitCode = 1;
    return null;
  }

  const fromWarehouse = await getWarehouseByName(fromWarehouseName);
  if (!fromWarehouse) {
    console.error(`移動元倉庫が見つかりません: ${fromWarehouseName}`);
    process.exitCode = 1;
    return null;
  }

  const toWarehouse = await getWarehouseByName(toWarehouseName);
  if (!toWarehouse) {
    console.error(`移動先倉庫が見つかりません: ${toWarehouseName}`);
    process.exitCode = 1;
    return null;
  }

  return { product, fromWarehouse, toWarehouse };
}

export function registerStockCommands(parent: Command) {
  const cmd = parent.command("stock").description("在庫管理");

  cmd
    .command("in")
    .description("入庫（任意でロット情報を指定可能）")
    .requiredOption("--sku <sku>", "商品SKU")
    .requiredOption("--quantity <qty>", "数量", parseInt)
    .requiredOption("--warehouse <name>", "倉庫名")
    .option("--lot-code <code>", "ロットコード", "")
    .option("--expiry <YYYY-MM-DD>", "有効期限")
    .option("--note <note>", "備考", "")
    .action(
      async (opts: {
        sku: string;
        quantity: number;
        warehouse: string;
        lotCode: string;
        expiry?: string;
        note: string;
      }) => {
        if (opts.expiry && !ISO_DATE_RE.test(opts.expiry)) {
          console.error("--expiry は YYYY-MM-DD 形式で指定してください");
          process.exitCode = 1;
          return;
        }
        const resolved = await resolveProductAndWarehouse(opts.sku, opts.warehouse);
        if (!resolved) return;
        const movement = await stockIn({
          product_id: resolved.product.id,
          warehouse_id: resolved.warehouse.id,
          quantity: opts.quantity,
          lot_code: opts.lotCode,
          expiry_date: opts.expiry,
          reference_type: opts.note ? "manual" : "",
          reference_id: opts.note,
        });
        const lotLabel = opts.lotCode ? ` lot=${opts.lotCode}` : "";
        const expiryLabel = opts.expiry ? ` 期限=${opts.expiry}` : "";
        console.log(
          `入庫しました: ${opts.sku} x ${movement.quantity} → ${opts.warehouse}${lotLabel}${expiryLabel}`,
        );
      },
    );

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
    .command("transfer")
    .description("倉庫間在庫移動")
    .requiredOption("--sku <sku>", "商品SKU")
    .requiredOption("--quantity <qty>", "数量", parseInt)
    .requiredOption("--from <name>", "移動元倉庫名")
    .requiredOption("--to <name>", "移動先倉庫名")
    .option("--note <note>", "備考", "")
    .action(async (opts: { sku: string; quantity: number; from: string; to: string; note: string }) => {
      const resolved = await resolveProductAndWarehouses(opts.sku, opts.from, opts.to);
      if (!resolved) return;

      const transfer = await stockTransfer({
        product_id: resolved.product.id,
        from_warehouse_id: resolved.fromWarehouse.id,
        to_warehouse_id: resolved.toWarehouse.id,
        quantity: opts.quantity,
        reference_type: opts.note ? "manual_transfer" : "transfer",
        reference_id: opts.note,
      });

      console.log(
        `在庫を移動しました: ${opts.sku} x ${transfer.out.quantity} ${opts.from} → ${opts.to}`,
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

  cmd
    .command("lots")
    .description("ロット一覧（FIFO 順）")
    .option("--sku <sku>", "商品SKU で絞り込み")
    .option("--warehouse <name>", "倉庫名で絞り込み")
    .option("--include-empty", "残量 0 のロットも表示", false)
    .action(async (opts: { sku?: string; warehouse?: string; includeEmpty: boolean }) => {
      const filter: { product_id?: string; warehouse_id?: string; include_empty?: boolean } = {
        include_empty: opts.includeEmpty,
      };
      if (opts.sku) {
        const product = await getProductBySku(opts.sku);
        if (!product) {
          console.error(`商品が見つかりません: SKU=${opts.sku}`);
          process.exitCode = 1;
          return;
        }
        filter.product_id = product.id;
      }
      if (opts.warehouse) {
        const warehouse = await getWarehouseByName(opts.warehouse);
        if (!warehouse) {
          console.error(`倉庫が見つかりません: ${opts.warehouse}`);
          process.exitCode = 1;
          return;
        }
        filter.warehouse_id = warehouse.id;
      }

      const lots = await listLots(filter);
      if (lots.length === 0) {
        console.log("該当するロットはありません");
        return;
      }
      console.log(
        formatTable(
          ["SKU", "倉庫", "ロット", "残量", "期限", "入庫日時"],
          lots.map((l) => [
            l.sku,
            l.warehouse_name,
            l.lot_code || "-",
            String(l.quantity_remaining),
            l.expiry_date ?? "-",
            l.received_at,
          ]),
        ),
      );
    });

  cmd
    .command("expiring")
    .description("期限切れ／期限間近のロットを表示")
    .option("--days <n>", "何日先まで含めるか（デフォルト 30）", (v) => parseInt(v, 10), 30)
    .action(async (opts: { days: number }) => {
      if (!Number.isFinite(opts.days) || opts.days < 0) {
        console.error("--days は 0 以上の整数を指定してください");
        process.exitCode = 1;
        return;
      }
      const lots = await getExpiringLots(opts.days);
      if (lots.length === 0) {
        console.log(`期限が${opts.days}日以内のロットはありません`);
        return;
      }
      console.log(
        formatTable(
          ["SKU", "倉庫", "ロット", "残量", "期限", "残日数"],
          lots.map((l) => [
            l.sku,
            l.warehouse_name,
            l.lot_code || "-",
            String(l.quantity_remaining),
            l.expiry_date,
            l.days_until_expiry < 0 ? `期限切れ(${l.days_until_expiry})` : String(l.days_until_expiry),
          ]),
        ),
      );
    });
}
