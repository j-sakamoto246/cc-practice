import { Command } from "commander";
import { startServer } from "../server/index.js";

export function registerServeCommand(parent: Command) {
  parent
    .command("serve")
    .description("REST API サーバを起動")
    .option("--port <port>", "ポート番号", (v) => parseInt(v, 10), 3000)
    .action(async (opts: { port: number }) => {
      await startServer({ port: opts.port });
    });
}
