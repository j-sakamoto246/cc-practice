export class InsufficientStockError extends Error {
  public readonly currentQuantity: number;
  public readonly requestedQuantity: number;

  constructor(currentQuantity: number, requestedQuantity: number) {
    super(`在庫不足です: 現在庫=${currentQuantity}, 要求=${requestedQuantity}`);
    this.name = "InsufficientStockError";
    this.currentQuantity = currentQuantity;
    this.requestedQuantity = requestedQuantity;
  }
}
