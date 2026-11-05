/**
 * Stock engine error hierarchy.
 */

export class StockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockError';
  }
}

export class InsufficientStockError extends StockError {
  constructor(
    public readonly itemId: string,
    public readonly locationId: string,
    public readonly required: number,
    public readonly available: number,
    public readonly batchId?: string,
  ) {
    const loc = batchId
      ? `item=${itemId} location=${locationId} batch=${batchId}`
      : `item=${itemId} location=${locationId}`;
    super(
      `Insufficient stock for ${loc}: required=${required} available=${available}`,
    );
    this.name = 'InsufficientStockError';
  }
}

export class MovementAlreadyReversedError extends StockError {
  constructor(public readonly movementId: string) {
    super(`Movement ${movementId} has already been reversed`);
    this.name = 'MovementAlreadyReversedError';
  }
}
