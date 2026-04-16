#!/usr/bin/env node
import { Command } from "commander";
import { initDatabase, closeDatabase } from "./db/client.js";

const program = new Command();

program
  .name("inventory")
  .version("1.0.0")
  .description("CLI-based inventory management system")
  .hook("preAction", async () => {
    await initDatabase();
  });

// TODO: register commands here

program.parseAsync().catch((err) => {
  console.error(err);
  process.exitCode = 1;
}).finally(() => {
  closeDatabase();
});
