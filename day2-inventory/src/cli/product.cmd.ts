import { Command } from "commander";
import {
  addProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  getProductBySku,
} from "../modules/product.js";
import { formatTable } from "../utils/formatter.js";

export function registerProductCommands(parent: Command) {
  const cmd = parent.command("product").description("商品管理");

  cmd
    .command("add")
    .description("商品を追加")
    .requiredOption("--name <name>", "商品名")
    .requiredOption("--sku <sku>", "SKU")
    .requiredOption("--price <price>", "販売価格", parseFloat)
    .option("--cost <cost>", "原価", parseFloat, 0)
    .option("--description <desc>", "説明", "")
    .action(async (opts: { name: string; sku: string; price: number; cost: number; description: string }) => {
      const product = await addProduct({
        name: opts.name,
        sku: opts.sku,
        price: opts.price,
        cost: opts.cost,
        description: opts.description,
      });
      console.log(`商品を追加しました: ${product.name} (ID: ${product.id})`);
    });

  cmd
    .command("list")
    .description("商品一覧")
    .option("--format <format>", "出力形式 (table|json)", "table")
    .action(async (opts: { format: string }) => {
      const products = await listProducts();
      if (products.length === 0) {
        console.log("商品がありません");
        return;
      }
      if (opts.format === "json") {
        console.log(JSON.stringify(products, null, 2));
      } else {
        console.log(
          formatTable(
            ["SKU", "名前", "価格", "原価", "説明"],
            products.map((p) => [p.sku, p.name, String(p.price), String(p.cost), p.description]),
          ),
        );
      }
    });

  cmd
    .command("update")
    .description("商品を更新")
    .requiredOption("--sku <sku>", "対象SKU")
    .option("--name <name>", "新しい商品名")
    .option("--price <price>", "新しい価格", parseFloat)
    .option("--cost <cost>", "新しい原価", parseFloat)
    .action(async (opts: { sku: string; name?: string; price?: number; cost?: number }) => {
      const product = await getProductBySku(opts.sku);
      if (!product) {
        console.error(`商品が見つかりません: SKU=${opts.sku}`);
        process.exitCode = 1;
        return;
      }
      const updated = await updateProduct(product.id, {
        name: opts.name,
        price: opts.price,
        cost: opts.cost,
      });
      console.log(`商品を更新しました: ${updated.name} (SKU: ${updated.sku})`);
    });

  cmd
    .command("delete")
    .description("商品を削除")
    .requiredOption("--sku <sku>", "対象SKU")
    .action(async (opts: { sku: string }) => {
      const product = await getProductBySku(opts.sku);
      if (!product) {
        console.error(`商品が見つかりません: SKU=${opts.sku}`);
        process.exitCode = 1;
        return;
      }
      await deleteProduct(product.id);
      console.log(`商品を削除しました: ${product.name} (SKU: ${opts.sku})`);
    });
}
