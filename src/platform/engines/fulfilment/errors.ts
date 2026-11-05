/**
 * Fulfilment engine errors.
 */

export class FulfilmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FulfilmentError';
  }
}

export class OverFulfilmentError extends FulfilmentError {
  constructor(
    public readonly sourceLineId: string,
    public readonly qtyOrdered: number,
    public readonly qtyLinked: number,
  ) {
    super(
      `Over-fulfilment on line ${sourceLineId}: ordered ${qtyOrdered}, would link ${qtyLinked}`,
    );
    this.name = 'OverFulfilmentError';
  }
}
