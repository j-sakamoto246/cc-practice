import { getClient } from "../db/client.js";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";

export interface Campaign {
  id: string;
  name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  start_date: string;
  end_date: string;
  active: number;
}

export interface CreateCampaignInput {
  name: string;
  discount_type: "percentage" | "fixed";
  discount_value: number;
  start_date: string;
  end_date: string;
}

export interface ApplyCampaignResult {
  order_id: string;
  campaign_id: string;
  original_amount: number;
  discount_amount: number;
  final_amount: number;
}

export async function createCampaign(
  input: CreateCampaignInput,
): Promise<Campaign> {
  const client = getClient();

  if (input.discount_value <= 0) {
    throw new Error("割引値は0より大きい値を指定してください");
  }

  if (input.discount_type === "percentage" && input.discount_value > 100) {
    throw new Error("割引率は100以下を指定してください");
  }

  if (input.end_date < input.start_date) {
    throw new Error("終了日は開始日以降を指定してください");
  }

  const id = generateId();

  await client.execute({
    sql: `INSERT INTO campaigns (id, name, discount_type, discount_value, start_date, end_date)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      input.name,
      input.discount_type,
      input.discount_value,
      input.start_date,
      input.end_date,
    ],
  });

  logger.info(`キャンペーンを作成しました: ${input.name} (${id})`);

  return (await getCampaignById(id))!;
}

export async function applyCampaign(
  orderId: string,
  campaignId: string,
  currentDate?: string,
): Promise<ApplyCampaignResult> {
  const client = getClient();

  // 受注の存在確認
  const orderResult = await client.execute({
    sql: "SELECT * FROM orders WHERE id = ?",
    args: [orderId],
  });
  const order = orderResult.rows[0];
  if (!order) {
    throw new Error(`受注が見つかりません: ${orderId}`);
  }

  if (order["status"] !== "pending") {
    throw new Error(
      `pending 以外の受注にはキャンペーンを適用できません: status=${order["status"] as string}`,
    );
  }

  // キャンペーンの存在確認
  const campaign = await getCampaignById(campaignId);
  if (!campaign) {
    throw new Error(`キャンペーンが見つかりません: ${campaignId}`);
  }

  if (!campaign.active) {
    throw new Error("無効なキャンペーンです");
  }

  // 期間チェック
  const today = currentDate ?? new Date().toISOString().split("T")[0]!;
  if (today < campaign.start_date || today > campaign.end_date) {
    throw new Error(
      `キャンペーン期間外です: ${campaign.start_date} 〜 ${campaign.end_date}`,
    );
  }

  // 割引額の計算
  const originalAmount = order["total_amount"] as number;
  let discountAmount: number;

  if (campaign.discount_type === "percentage") {
    discountAmount = Math.round(originalAmount * (campaign.discount_value / 100));
  } else {
    discountAmount = Math.min(campaign.discount_value, originalAmount);
  }

  const finalAmount = originalAmount - discountAmount;

  // 受注金額を更新
  await client.execute({
    sql: "UPDATE orders SET total_amount = ?, updated_at = datetime('now') WHERE id = ?",
    args: [finalAmount, orderId],
  });

  logger.info(
    `キャンペーンを適用しました: order=${orderId}, campaign=${campaignId}, 割引=${discountAmount}`,
  );

  return {
    order_id: orderId,
    campaign_id: campaignId,
    original_amount: originalAmount,
    discount_amount: discountAmount,
    final_amount: finalAmount,
  };
}

export async function listActiveCampaigns(
  currentDate?: string,
): Promise<Campaign[]> {
  const client = getClient();

  const today = currentDate ?? new Date().toISOString().split("T")[0]!;

  const result = await client.execute({
    sql: `SELECT * FROM campaigns
          WHERE active = 1 AND start_date <= ? AND end_date >= ?
          ORDER BY start_date`,
    args: [today, today],
  });

  logger.info(`有効なキャンペーン一覧を取得しました (${result.rows.length}件)`);

  return result.rows.map(rowToCampaign);
}

async function getCampaignById(id: string): Promise<Campaign | null> {
  const client = getClient();

  const result = await client.execute({
    sql: "SELECT * FROM campaigns WHERE id = ?",
    args: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  return rowToCampaign(row);
}

function rowToCampaign(row: Record<string, unknown>): Campaign {
  return {
    id: row["id"] as string,
    name: row["name"] as string,
    discount_type: row["discount_type"] as "percentage" | "fixed",
    discount_value: row["discount_value"] as number,
    start_date: row["start_date"] as string,
    end_date: row["end_date"] as string,
    active: row["active"] as number,
  };
}
