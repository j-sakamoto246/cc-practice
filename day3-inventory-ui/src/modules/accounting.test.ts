import { describe, expect, it } from "vitest";

import { exportToCSV } from "./accounting";

describe("exportToCSV", () => {
  it("シンプルな数値・文字列をカンマ区切りで出力する", () => {
    const csv = exportToCSV(
      ["date", "total_sales", "transaction_count"],
      [
        ["2026-04-01", 1500, 3],
        ["2026-04-02", 2200, 5],
      ],
    );

    expect(csv).toBe(
      ["date,total_sales,transaction_count", "2026-04-01,1500,3", "2026-04-02,2200,5"].join("\n"),
    );
  });

  it("カンマや改行・引用符を含むフィールドはダブルクォートで囲み、内部の引用符はエスケープする", () => {
    const csv = exportToCSV(
      ["name", "memo"],
      [
        ["商品A,B", '彼は"hello"と言った'],
        ["改行を\n含む", "通常"],
      ],
    );

    const lines = csv.split("\n");
    // 改行を含むフィールドはクォートされるため、論理的には 3 行 + 改行で計 4 行
    expect(lines[0]).toBe("name,memo");
    expect(lines[1]).toBe('"商品A,B","彼は""hello""と言った"');
    // 改行を含むフィールドはクォートされ、内部に \n を保持する
    expect(csv).toContain('"改行を\n含む"');
  });

  it("行が空でもヘッダーは出力する", () => {
    const csv = exportToCSV(["a", "b"], []);
    expect(csv).toBe("a,b");
  });
});
