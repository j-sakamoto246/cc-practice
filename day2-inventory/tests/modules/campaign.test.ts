import { describe, it, expect, beforeEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import {
  createCampaign,
  applyCampaign,
  listActiveCampaigns,
} from "../../src/modules/campaign.js";
import { createOrder } from "../../src/modules/order.js";

async function seedMasterData() {
  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-1", "SKU-001", "商品A", 1000, 500],
    },
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-2", "SKU-002", "商品B", 2000, 800],
    },
  ]);
}

describe("campaign module", () => {
  beforeEach(async () => {
    await seedMasterData();
  });

  const samplePercentage = {
    name: "夏セール",
    discount_type: "percentage" as const,
    discount_value: 10,
    start_date: "2026-04-01",
    end_date: "2026-04-30",
  };

  const sampleFixed = {
    name: "500円引きクーポン",
    discount_type: "fixed" as const,
    discount_value: 500,
    start_date: "2026-04-01",
    end_date: "2026-04-30",
  };

  // ============================================================
  // createCampaign
  // ============================================================
  describe("createCampaign", () => {
    // --- 正常系 ---
    it("percentage キャンペーンを作成できる", async () => {
      const campaign = await createCampaign(samplePercentage);

      expect(campaign.id).toBeDefined();
      expect(campaign.name).toBe("夏セール");
      expect(campaign.discount_type).toBe("percentage");
      expect(campaign.discount_value).toBe(10);
      expect(campaign.start_date).toBe("2026-04-01");
      expect(campaign.end_date).toBe("2026-04-30");
      expect(campaign.active).toBe(1);
    });

    it("fixed キャンペーンを作成できる", async () => {
      const campaign = await createCampaign(sampleFixed);

      expect(campaign.discount_type).toBe("fixed");
      expect(campaign.discount_value).toBe(500);
    });

    it("同日の開始・終了で作成できる", async () => {
      const campaign = await createCampaign({
        ...samplePercentage,
        start_date: "2026-05-01",
        end_date: "2026-05-01",
      });

      expect(campaign.start_date).toBe("2026-05-01");
      expect(campaign.end_date).toBe("2026-05-01");
    });

    // --- 異常系 ---
    it("discount_value が 0 だとエラーになる", async () => {
      await expect(
        createCampaign({ ...samplePercentage, discount_value: 0 }),
      ).rejects.toThrow("割引値は0より大きい値を指定してください");
    });

    it("discount_value が負数だとエラーになる", async () => {
      await expect(
        createCampaign({ ...samplePercentage, discount_value: -10 }),
      ).rejects.toThrow("割引値は0より大きい値を指定してください");
    });

    it("percentage で 100 超だとエラーになる", async () => {
      await expect(
        createCampaign({ ...samplePercentage, discount_value: 101 }),
      ).rejects.toThrow("割引率は100以下を指定してください");
    });

    it("percentage で 100 は許容される", async () => {
      const campaign = await createCampaign({
        ...samplePercentage,
        discount_value: 100,
      });
      expect(campaign.discount_value).toBe(100);
    });

    it("end_date < start_date だとエラーになる", async () => {
      await expect(
        createCampaign({
          ...samplePercentage,
          start_date: "2026-05-01",
          end_date: "2026-04-01",
        }),
      ).rejects.toThrow("終了日は開始日以降を指定してください");
    });
  });

  // ============================================================
  // applyCampaign
  // ============================================================
  describe("applyCampaign", () => {
    // --- 正常系 ---
    it("percentage キャンペーンで割引額が計算される", async () => {
      const campaign = await createCampaign(samplePercentage); // 10%
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 2, unit_price: 1000 }],
      }); // total=2000

      const result = await applyCampaign(order.id, campaign.id, "2026-04-15");

      expect(result.original_amount).toBe(2000);
      expect(result.discount_amount).toBe(200); // 2000 * 10%
      expect(result.final_amount).toBe(1800);
    });

    it("fixed キャンペーンで割引額が計算される", async () => {
      const campaign = await createCampaign(sampleFixed); // 500円引き
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 2, unit_price: 1000 }],
      }); // total=2000

      const result = await applyCampaign(order.id, campaign.id, "2026-04-15");

      expect(result.original_amount).toBe(2000);
      expect(result.discount_amount).toBe(500);
      expect(result.final_amount).toBe(1500);
    });

    it("適用後に受注の total_amount が更新される", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 2, unit_price: 1000 }],
      });

      await applyCampaign(order.id, campaign.id, "2026-04-15");

      const client = getClient();
      const result = await client.execute({
        sql: "SELECT total_amount FROM orders WHERE id = ?",
        args: [order.id],
      });
      expect(result.rows[0]!["total_amount"]).toBe(1800);
    });

    it("期間の開始日に適用できる", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      const result = await applyCampaign(order.id, campaign.id, "2026-04-01");

      expect(result.discount_amount).toBe(100);
    });

    it("期間の終了日に適用できる", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      const result = await applyCampaign(order.id, campaign.id, "2026-04-30");

      expect(result.discount_amount).toBe(100);
    });

    // --- 異常系 ---
    it("存在しない受注だとエラーになる", async () => {
      const campaign = await createCampaign(samplePercentage);

      await expect(
        applyCampaign("nonexistent", campaign.id, "2026-04-15"),
      ).rejects.toThrow("受注が見つかりません");
    });

    it("存在しないキャンペーンだとエラーになる", async () => {
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      await expect(
        applyCampaign(order.id, "nonexistent", "2026-04-15"),
      ).rejects.toThrow("キャンペーンが見つかりません");
    });

    it("pending 以外の受注にはエラーになる", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      // confirmed に遷移
      const client = getClient();
      await client.execute({
        sql: "UPDATE orders SET status = 'confirmed' WHERE id = ?",
        args: [order.id],
      });

      await expect(
        applyCampaign(order.id, campaign.id, "2026-04-15"),
      ).rejects.toThrow("pending 以外の受注にはキャンペーンを適用できません");
    });

    it("無効なキャンペーンだとエラーになる", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      // 無効化
      const client = getClient();
      await client.execute({
        sql: "UPDATE campaigns SET active = 0 WHERE id = ?",
        args: [campaign.id],
      });

      await expect(
        applyCampaign(order.id, campaign.id, "2026-04-15"),
      ).rejects.toThrow("無効なキャンペーンです");
    });

    it("期間外（開始日前）だとエラーになる", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      await expect(
        applyCampaign(order.id, campaign.id, "2026-03-31"),
      ).rejects.toThrow("キャンペーン期間外です");
    });

    it("期間外（終了日後）だとエラーになる", async () => {
      const campaign = await createCampaign(samplePercentage);
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      await expect(
        applyCampaign(order.id, campaign.id, "2026-05-01"),
      ).rejects.toThrow("キャンペーン期間外です");
    });

    // --- 境界値 ---
    it("fixed 割引が受注金額を超える場合は受注金額が上限になる", async () => {
      const campaign = await createCampaign({
        ...sampleFixed,
        discount_value: 5000,
      }); // 5000円引き
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      }); // total=1000

      const result = await applyCampaign(order.id, campaign.id, "2026-04-15");

      expect(result.discount_amount).toBe(1000); // 上限 = 受注金額
      expect(result.final_amount).toBe(0);
    });

    it("percentage 100% で全額割引になる", async () => {
      const campaign = await createCampaign({
        ...samplePercentage,
        discount_value: 100,
      });
      const order = await createOrder({
        customer_name: "テスト顧客",
        items: [{ product_id: "prod-1", quantity: 1, unit_price: 1000 }],
      });

      const result = await applyCampaign(order.id, campaign.id, "2026-04-15");

      expect(result.discount_amount).toBe(1000);
      expect(result.final_amount).toBe(0);
    });
  });

  // ============================================================
  // listActiveCampaigns
  // ============================================================
  describe("listActiveCampaigns", () => {
    // --- 正常系 ---
    it("有効なキャンペーンが返る", async () => {
      await createCampaign(samplePercentage); // 4/1〜4/30

      const campaigns = await listActiveCampaigns("2026-04-15");

      expect(campaigns).toHaveLength(1);
      expect(campaigns[0]!.name).toBe("夏セール");
    });

    it("複数の有効なキャンペーンが返る", async () => {
      await createCampaign(samplePercentage);
      await createCampaign(sampleFixed);

      const campaigns = await listActiveCampaigns("2026-04-15");

      expect(campaigns).toHaveLength(2);
    });

    it("0件の場合は空配列を返す", async () => {
      const campaigns = await listActiveCampaigns("2026-04-15");
      expect(campaigns).toEqual([]);
    });

    it("期間外のキャンペーンは含まれない", async () => {
      await createCampaign(samplePercentage); // 4/1〜4/30

      const campaigns = await listActiveCampaigns("2026-05-15");

      expect(campaigns).toHaveLength(0);
    });

    it("active=0 のキャンペーンは含まれない", async () => {
      const campaign = await createCampaign(samplePercentage);

      const client = getClient();
      await client.execute({
        sql: "UPDATE campaigns SET active = 0 WHERE id = ?",
        args: [campaign.id],
      });

      const campaigns = await listActiveCampaigns("2026-04-15");

      expect(campaigns).toHaveLength(0);
    });

    // --- 境界値 ---
    it("開始日ちょうどのキャンペーンが含まれる", async () => {
      await createCampaign(samplePercentage); // 4/1〜4/30

      const campaigns = await listActiveCampaigns("2026-04-01");

      expect(campaigns).toHaveLength(1);
    });

    it("終了日ちょうどのキャンペーンが含まれる", async () => {
      await createCampaign(samplePercentage); // 4/1〜4/30

      const campaigns = await listActiveCampaigns("2026-04-30");

      expect(campaigns).toHaveLength(1);
    });

    it("開始日の前日では含まれない", async () => {
      await createCampaign(samplePercentage);

      const campaigns = await listActiveCampaigns("2026-03-31");

      expect(campaigns).toHaveLength(0);
    });

    it("終了日の翌日では含まれない", async () => {
      await createCampaign(samplePercentage);

      const campaigns = await listActiveCampaigns("2026-05-01");

      expect(campaigns).toHaveLength(0);
    });
  });
});
