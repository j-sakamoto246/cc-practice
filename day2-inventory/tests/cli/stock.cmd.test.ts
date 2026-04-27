import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { getClient } from "../../src/db/client.js";
import {
  resolveProductAndWarehouse,
  resolveProductAndWarehouses,
} from "../../src/cli/stock.cmd.js";

async function seedMasterData() {
  const client = getClient();
  await client.batch([
    {
      sql: "INSERT INTO products (id, sku, name, price, cost) VALUES (?, ?, ?, ?, ?)",
      args: ["prod-1", "SKU-001", "テスト商品A", 1000, 500],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-1", "東京倉庫", "東京"],
    },
    {
      sql: "INSERT INTO warehouses (id, name, location) VALUES (?, ?, ?)",
      args: ["wh-2", "大阪倉庫", "大阪"],
    },
  ]);
}

describe("resolveProductAndWarehouse", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | string | undefined;

  beforeEach(async () => {
    await seedMasterData();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it("存在する SKU と倉庫名で product と warehouse を解決できる", async () => {
    const result = await resolveProductAndWarehouse("SKU-001", "東京倉庫");

    expect(result).not.toBeNull();
    expect(result!.product.id).toBe("prod-1");
    expect(result!.product.sku).toBe("SKU-001");
    expect(result!.warehouse.id).toBe("wh-1");
    expect(result!.warehouse.name).toBe("東京倉庫");
  });

  it("存在しない SKU では null を返してエラーメッセージを出力する", async () => {
    const result = await resolveProductAndWarehouse("NONEXISTENT-SKU", "東京倉庫");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "商品が見つかりません: SKU=NONEXISTENT-SKU",
    );
    expect(process.exitCode).toBe(1);
  });

  it("存在しない倉庫名では null を返してエラーメッセージを出力する", async () => {
    const result = await resolveProductAndWarehouse("SKU-001", "存在しない倉庫");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "倉庫が見つかりません: 存在しない倉庫",
    );
    expect(process.exitCode).toBe(1);
  });

  it("SKU が存在しない場合は倉庫の存在確認を行わない", async () => {
    const result = await resolveProductAndWarehouse(
      "NONEXISTENT-SKU",
      "存在しない倉庫",
    );

    expect(result).toBeNull();
    // SKU エラーのみが出力され、倉庫エラーは出力されない
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "商品が見つかりません: SKU=NONEXISTENT-SKU",
    );
  });

  it("空文字の SKU では null を返す", async () => {
    const result = await resolveProductAndWarehouse("", "東京倉庫");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith("商品が見つかりません: SKU=");
    expect(process.exitCode).toBe(1);
  });
});

describe("resolveProductAndWarehouses", () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
  let originalExitCode: number | string | undefined;

  beforeEach(async () => {
    await seedMasterData();
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    originalExitCode = process.exitCode;
    process.exitCode = 0;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it("存在する SKU と移動元・移動先倉庫名を解決できる", async () => {
    const result = await resolveProductAndWarehouses("SKU-001", "東京倉庫", "大阪倉庫");

    expect(result).not.toBeNull();
    expect(result!.product.id).toBe("prod-1");
    expect(result!.fromWarehouse.id).toBe("wh-1");
    expect(result!.toWarehouse.id).toBe("wh-2");
  });

  it("移動元倉庫が存在しない場合は null を返してエラーメッセージを出力する", async () => {
    const result = await resolveProductAndWarehouses("SKU-001", "存在しない倉庫", "大阪倉庫");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "移動元倉庫が見つかりません: 存在しない倉庫",
    );
    expect(process.exitCode).toBe(1);
  });

  it("移動先倉庫が存在しない場合は null を返してエラーメッセージを出力する", async () => {
    const result = await resolveProductAndWarehouses("SKU-001", "東京倉庫", "存在しない倉庫");

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "移動先倉庫が見つかりません: 存在しない倉庫",
    );
    expect(process.exitCode).toBe(1);
  });
});
