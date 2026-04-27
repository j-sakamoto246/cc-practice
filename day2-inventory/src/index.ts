#!/usr/bin/env node
import { Command } from "commander";
import { initDatabase, closeDatabase } from "./db/client.js";
import { registerProductCommands } from "./cli/product.cmd.js";
import { registerStockCommands } from "./cli/stock.cmd.js";
import { registerOrderCommands } from "./cli/order.cmd.js";
import { registerCampaignCommands } from "./cli/campaign.cmd.js";
import { registerAccountingCommands } from "./cli/accounting.cmd.js";
import { registerImportCommands } from "./cli/import.cmd.js";
import { registerServeCommand } from "./cli/serve.cmd.js";

const program = new Command();

program
  .name("inventory")
  .version("1.1.0")
  .description("CLI-based inventory management system")
  .hook("preAction", async (_thisCommand, actionCommand) => {
    if (actionCommand.name() === "serve") return;
    await initDatabase();
  });

registerProductCommands(program);
registerStockCommands(program);
registerOrderCommands(program);
registerCampaignCommands(program);
registerAccountingCommands(program);
registerImportCommands(program);
registerServeCommand(program);

program.parseAsync().catch((err: Error) => {
  console.error(`エラー: ${err.message}`);
  process.exitCode = 1;
}).finally(() => {
  closeDatabase();
});
