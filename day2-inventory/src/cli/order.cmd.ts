import { Command } from "commander";
import { getClient } from "../db/client.js";
import { generateId } from "../utils/id.js";
import {
  createOrder,
  listOrders,
  updateOrderStatus,
} from "../modules/order.js";
import { getProductBySku } from "../modules/product.js";
import { formatTable } from "../utils/formatter.js";

export function registerOrderCommands(parent: Command) {
  const cmd = parent.command("order").description("受注管理");

  cmd
    .command("create")
    .description("受注を作成")
    .requiredOption("--customer <name>", "顧客名")
    .requiredOption("--items <items>", "明細 (sku:qty,sku:qty)")
    .action(async (opts: { customer: string; items: string }) => {
      const itemParts = opts.items.split(",").map((s) => s.trim());
      const items = [];

      for (const part of itemParts) {
        const [sku, qtyStr] = part.split(":");
        if (!sku || !qtyStr) {
          console.error(`明細の書式が不正です: "${part}" (正しい形式: sku:qty)`);
          process.exitCode = 1;
          return;
        }
        const product = await getProductBySku(sku);
        if (!product) {
          console.error(`商品が見つかりません: SKU=${sku}`);
          process.exitCode = 1;
          return;
        }
        items.push({
          product_id: product.id,
          quantity: parseInt(qtyStr, 10),
          unit_price: product.price,
        });
      }

      const order = await createOrder({
        customer_name: opts.customer,
        items,
      });
      console.log(`受注を作成しました: ${order.id} (合計: ${order.total_amount}円)`);
    });

  cmd
    .command("list")
    .description("受注一覧")
    .option("--status <status>", "ステータスで絞り込み")
    .option("--customer <name>", "顧客名で絞り込み")
    .action(async (opts: { status?: string; customer?: string }) => {
      let orders = await listOrders();

      if (opts.status) {
        orders = orders.filter((o) => o.status === opts.status);
      }
      if (opts.customer) {
        orders = orders.filter((o) => o.customer_name.includes(opts.customer!));
      }

      if (orders.length === 0) {
        console.log("受注がありません");
        return;
      }

      console.log(
        formatTable(
          ["ID", "顧客", "ステータス", "合計", "作成日"],
          orders.map((o) => [
            o.id.slice(0, 8),
            o.customer_name,
            o.status,
            String(o.total_amount),
            o.created_at,
          ]),
        ),
      );
    });

  cmd
    .command("ship")
    .description("出荷処理")
    .requiredOption("--order-id <id>", "受注ID")
    .requiredOption("--carrier <carrier>", "配送業者")
    .requiredOption("--tracking <number>", "追跡番号")
    .action(async (opts: { orderId: string; carrier: string; tracking: string }) => {
      const client = getClient();

      // 受注を shipped に更新
      await updateOrderStatus(opts.orderId, "shipped");

      // shipment レコードを作成
      const shipmentId = generateId();
      await client.execute({
        sql: `INSERT INTO shipments (id, order_id, tracking_number, carrier, status, shipped_at)
              VALUES (?, ?, ?, ?, 'shipped', datetime('now'))`,
        args: [shipmentId, opts.orderId, opts.tracking, opts.carrier],
      });

      console.log(`出荷しました: ${opts.orderId}`);
      console.log(`  配送業者: ${opts.carrier}`);
      console.log(`  追跡番号: ${opts.tracking}`);
    });

  cmd
    .command("status")
    .description("受注ステータスを更新")
    .requiredOption("--order-id <id>", "受注ID")
    .action(async (opts: { orderId: string }) => {
      const client = getClient();

      const orderResult = await client.execute({
        sql: "SELECT * FROM orders WHERE id = ?",
        args: [opts.orderId],
      });
      const order = orderResult.rows[0];
      if (!order) {
        console.error(`受注が見つかりません: ${opts.orderId}`);
        process.exitCode = 1;
        return;
      }

      const itemsResult = await client.execute({
        sql: `SELECT oi.*, p.sku, p.name as product_name
              FROM order_items oi
              JOIN products p ON p.id = oi.product_id
              WHERE oi.order_id = ?`,
        args: [opts.orderId],
      });

      const shipmentResult = await client.execute({
        sql: "SELECT * FROM shipments WHERE order_id = ?",
        args: [opts.orderId],
      });

      console.log(`受注ID: ${order["id"] as string}`);
      console.log(`顧客:   ${order["customer_name"] as string}`);
      console.log(`状態:   ${order["status"] as string}`);
      console.log(`合計:   ${order["total_amount"] as number}円`);
      console.log("");
      console.log("明細:");
      console.log(
        formatTable(
          ["SKU", "商品名", "数量", "単価", "小計"],
          itemsResult.rows.map((r) => [
            r["sku"] as string,
            r["product_name"] as string,
            String(r["quantity"]),
            String(r["unit_price"]),
            String(r["subtotal"]),
          ]),
        ),
      );

      if (shipmentResult.rows.length > 0) {
        console.log("");
        console.log("発送:");
        for (const s of shipmentResult.rows) {
          console.log(`  配送業者: ${s["carrier"] as string}`);
          console.log(`  追跡番号: ${s["tracking_number"] as string}`);
          console.log(`  状態:     ${s["status"] as string}`);
        }
      }
    });
}
