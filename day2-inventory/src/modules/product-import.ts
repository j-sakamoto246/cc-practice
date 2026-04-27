import { readFile } from "node:fs/promises";
import { addProduct, getProductBySku, type AddProductInput } from "./product.js";

const REQUIRED_COLUMNS = ["sku", "name", "price"] as const;
const OPTIONAL_COLUMNS = ["cost", "description", "min_quantity"] as const;

type ProductCsvColumn = (typeof REQUIRED_COLUMNS)[number] | (typeof OPTIONAL_COLUMNS)[number];

export interface ImportProductsResult {
  imported: number;
}

export interface ParsedProductCsvRow extends AddProductInput {
  rowNumber: number;
}

export async function importProductsFromCsv(filePath: string): Promise<ImportProductsResult> {
  const content = await readFile(filePath, "utf8");
  return importProductsFromCsvText(content);
}

export async function importProductsFromCsvText(content: string): Promise<ImportProductsResult> {
  const rows = parseProductCsv(content);

  await validateNoDuplicateSkus(rows);

  for (const row of rows) {
    await addProduct({
      sku: row.sku,
      name: row.name,
      description: row.description,
      price: row.price,
      cost: row.cost,
      minQuantity: row.minQuantity,
    });
  }

  return { imported: rows.length };
}

export function parseProductCsv(content: string): ParsedProductCsvRow[] {
  const records = parseCsvRecords(content);
  if (records.length === 0) {
    throw new Error("CSVファイルが空です");
  }

  const headers = records[0]!.map((header) => header.trim());
  validateHeaders(headers);

  return records.slice(1).map((record, index) => {
    const rowNumber = index + 2;
    const row = recordToObject(headers, record, rowNumber);
    return parseProductRow(row, rowNumber);
  });
}

function validateHeaders(headers: string[]): void {
  const headerSet = new Set(headers);
  for (const column of REQUIRED_COLUMNS) {
    if (!headerSet.has(column)) {
      throw new Error(`CSVに必須カラムがありません: ${column}`);
    }
  }

  const supportedColumns = new Set<ProductCsvColumn>([
    ...REQUIRED_COLUMNS,
    ...OPTIONAL_COLUMNS,
  ]);
  for (const header of headers) {
    if (!supportedColumns.has(header as ProductCsvColumn)) {
      throw new Error(`CSVに未対応のカラムがあります: ${header}`);
    }
  }
}

function recordToObject(
  headers: string[],
  record: string[],
  rowNumber: number,
): Record<ProductCsvColumn, string | undefined> {
  if (record.length !== headers.length) {
    throw new Error(`CSVの列数がヘッダーと一致しません: ${rowNumber}行目`);
  }

  const row = {} as Record<ProductCsvColumn, string | undefined>;
  headers.forEach((header, index) => {
    row[header as ProductCsvColumn] = record[index]?.trim();
  });
  return row;
}

function parseProductRow(
  row: Record<ProductCsvColumn, string | undefined>,
  rowNumber: number,
): ParsedProductCsvRow {
  const sku = requireValue(row.sku, "sku", rowNumber);
  const name = requireValue(row.name, "name", rowNumber);
  const price = parseNonNegativeNumber(row.price, "price", rowNumber);
  const cost = parseNonNegativeNumber(row.cost ?? "0", "cost", rowNumber);
  const minQuantity = parseNonNegativeInteger(
    row.min_quantity ?? "0",
    "min_quantity",
    rowNumber,
  );

  return {
    rowNumber,
    sku,
    name,
    description: row.description ?? "",
    price,
    cost,
    minQuantity,
  };
}

function requireValue(
  value: string | undefined,
  column: ProductCsvColumn,
  rowNumber: number,
): string {
  if (!value) {
    throw new Error(`CSVの${column}が空です: ${rowNumber}行目`);
  }
  return value;
}

function parseNonNegativeNumber(
  value: string | undefined,
  column: ProductCsvColumn,
  rowNumber: number,
): number {
  const text = requireValue(value, column, rowNumber);
  const parsed = Number(text);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`CSVの${column}は0以上の数値を指定してください: ${rowNumber}行目`);
  }
  return parsed;
}

function parseNonNegativeInteger(
  value: string | undefined,
  column: ProductCsvColumn,
  rowNumber: number,
): number {
  const parsed = parseNonNegativeNumber(value, column, rowNumber);
  if (!Number.isInteger(parsed)) {
    throw new Error(`CSVの${column}は0以上の整数を指定してください: ${rowNumber}行目`);
  }
  return parsed;
}

async function validateNoDuplicateSkus(rows: ParsedProductCsvRow[]): Promise<void> {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const duplicateRowNumber = seen.get(row.sku);
    if (duplicateRowNumber !== undefined) {
      throw new Error(
        `CSV内でSKUが重複しています: ${row.sku} (${duplicateRowNumber}行目と${row.rowNumber}行目)`,
      );
    }
    seen.set(row.sku, row.rowNumber);
  }

  for (const row of rows) {
    const existing = await getProductBySku(row.sku);
    if (existing) {
      throw new Error(`SKU が既に存在します: ${row.sku}`);
    }
  }
}

function parseCsvRecords(content: string): string[][] {
  const normalized = content.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = "";
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i]!;
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRecord.push(currentField);
      currentField = "";
      continue;
    }

    if (char === "\n" && !inQuotes) {
      currentRecord.push(currentField);
      addRecord(records, currentRecord);
      currentRecord = [];
      currentField = "";
      continue;
    }

    currentField += char;
  }

  if (inQuotes) {
    throw new Error("CSVの引用符が閉じられていません");
  }

  currentRecord.push(currentField);
  addRecord(records, currentRecord);
  return records;
}

function addRecord(records: string[][], record: string[]): void {
  if (record.length === 1 && record[0]!.trim() === "") {
    return;
  }
  records.push(record);
}
