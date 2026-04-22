import { Command } from "commander";
import {
  createCampaign,
  listActiveCampaigns,
  applyCampaign,
} from "../modules/campaign.js";
import { formatTable } from "../utils/formatter.js";

export function registerCampaignCommands(parent: Command) {
  const cmd = parent.command("campaign").description("キャンペーン管理");

  cmd
    .command("create")
    .description("キャンペーンを作成")
    .requiredOption("--name <name>", "キャンペーン名")
    .requiredOption("--type <type>", "割引タイプ (percentage|fixed)")
    .requiredOption("--value <value>", "割引値", parseFloat)
    .requiredOption("--start <date>", "開始日 (YYYY-MM-DD)")
    .requiredOption("--end <date>", "終了日 (YYYY-MM-DD)")
    .action(async (opts: { name: string; type: string; value: number; start: string; end: string }) => {
      if (opts.type !== "percentage" && opts.type !== "fixed") {
        console.error("割引タイプは percentage または fixed を指定してください");
        process.exitCode = 1;
        return;
      }
      const campaign = await createCampaign({
        name: opts.name,
        discount_type: opts.type,
        discount_value: opts.value,
        start_date: opts.start,
        end_date: opts.end,
      });
      console.log(`キャンペーンを作成しました: ${campaign.name} (ID: ${campaign.id})`);
    });

  cmd
    .command("list")
    .description("キャンペーン一覧")
    .option("--active", "有効なキャンペーンのみ表示")
    .action(async (opts: { active?: boolean }) => {
      const today = new Date().toISOString().split("T")[0]!;
      const campaigns = opts.active
        ? await listActiveCampaigns(today)
        : await listActiveCampaigns("9999-12-31"); // 全件取得用に遠い未来を指定

      if (campaigns.length === 0) {
        console.log("キャンペーンがありません");
        return;
      }

      console.log(
        formatTable(
          ["名前", "タイプ", "値", "開始日", "終了日"],
          campaigns.map((c) => [
            c.name,
            c.discount_type,
            String(c.discount_value),
            c.start_date,
            c.end_date,
          ]),
        ),
      );
    });

  cmd
    .command("apply")
    .description("受注にキャンペーンを適用")
    .requiredOption("--order-id <id>", "受注ID")
    .requiredOption("--campaign-id <id>", "キャンペーンID")
    .action(async (opts: { orderId: string; campaignId: string }) => {
      const result = await applyCampaign(opts.orderId, opts.campaignId);
      console.log(`キャンペーンを適用しました:`);
      console.log(`  元金額:   ${result.original_amount}円`);
      console.log(`  割引額:   ${result.discount_amount}円`);
      console.log(`  適用後:   ${result.final_amount}円`);
    });
}
