import { getClient } from "../db/client.js";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  cost: number;
  created_at: string;
  updated_at: string;
}

export interface AddProductInput {
  sku: string;
  name: string;
  description?: string;
  price: number;
  cost: number;
}

export interface UpdateProductInput {
  name?: string;
  description?: string;
  price?: number;
  cost?: number;
}

export async function addProduct(input: AddProductInput): Promise<Product> {
  const client = getClient();
  const id = generateId();

  await client.execute({
    sql: `INSERT INTO products (id, sku, name, description, price, cost)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [id, input.sku, input.name, input.description ?? "", input.price, input.cost],
  });

  logger.info(`商品を追加しました: ${input.name} (SKU: ${input.sku})`);

  const product = await getProductById(id);
  return product!;
}

export async function listProducts(): Promise<Product[]> {
  const client = getClient();

  const result = await client.execute("SELECT * FROM products ORDER BY created_at DESC");

  logger.info(`商品一覧を取得しました (${result.rows.length}件)`);

  return result.rows.map(rowToProduct);
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<Product> {
  const client = getClient();

  const existing = await getProductById(id);
  if (!existing) {
    throw new Error(`商品が見つかりません: ${id}`);
  }

  const fields: string[] = [];
  const args: (string | number)[] = [];

  if (input.name !== undefined) {
    fields.push("name = ?");
    args.push(input.name);
  }
  if (input.description !== undefined) {
    fields.push("description = ?");
    args.push(input.description);
  }
  if (input.price !== undefined) {
    fields.push("price = ?");
    args.push(input.price);
  }
  if (input.cost !== undefined) {
    fields.push("cost = ?");
    args.push(input.cost);
  }

  if (fields.length === 0) {
    logger.warn("更新するフィールドがありま��ん");
    return existing;
  }

  fields.push("updated_at = datetime('now')");
  args.push(id);

  await client.execute({
    sql: `UPDATE products SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  logger.info(`商品を更新しました: ${id}`);

  const updated = await getProductById(id);
  return updated!;
}

export async function deleteProduct(id: string): Promise<void> {
  const client = getClient();

  const existing = await getProductById(id);
  if (!existing) {
    throw new Error(`商品が見つかりません: ${id}`);
  }

  await client.execute({
    sql: "DELETE FROM products WHERE id = ?",
    args: [id],
  });

  logger.info(`商品を削除しました: ${existing.name} (${id})`);
}

async function getProductById(id: string): Promise<Product | null> {
  const client = getClient();

  const result = await client.execute({
    sql: "SELECT * FROM products WHERE id = ?",
    args: [id],
  });

  const row = result.rows[0];
  if (!row) return null;

  return rowToProduct(row);
}

function rowToProduct(row: Record<string, unknown>): Product {
  return {
    id: row["id"] as string,
    sku: row["sku"] as string,
    name: row["name"] as string,
    description: row["description"] as string,
    price: row["price"] as number,
    cost: row["cost"] as number,
    created_at: row["created_at"] as string,
    updated_at: row["updated_at"] as string,
  };
}
