import { getProductBySku } from "../modules/product.js";
import { getWarehouseByName } from "../modules/stock.js";

export async function resolveProductBySku(sku: string) {
  const product = await getProductBySku(sku);
  if (!product) {
    throw new Error(`商品が見つかりません: SKU=${sku}`);
  }
  return product;
}

export async function resolveWarehouseByName(name: string) {
  const warehouse = await getWarehouseByName(name);
  if (!warehouse) {
    throw new Error(`倉庫が見つかりません: ${name}`);
  }
  return warehouse;
}
