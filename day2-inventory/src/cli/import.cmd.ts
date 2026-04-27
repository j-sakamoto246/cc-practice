import { Command } from "commander";
import { importProductsFromCsv } from "../modules/product-import.js";

export function registerImportCommands(parent: Command) {
  const cmd = parent.command("import").description("一括インポート");

  cmd
    .command("products")
    .description("CSVファイルから商品を一括インポート")
    .requiredOption("--file <file>", "CSVファイルのパス")
    .action(async (opts: { file: string }) => {
      const result = await importProductsFromCsv(opts.file);
      console.log(`商品をインポートしました: ${result.imported}件`);
    });
}
