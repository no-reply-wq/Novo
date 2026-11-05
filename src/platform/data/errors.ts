/**
 * Error types for the data layer.
 */

export class NotConfiguredError extends Error {
  constructor(feature: string) {
    super(`${feature} is not configured`);
    this.name = 'NotConfiguredError';
  }
}

export class RecordNotFoundError extends Error {
  constructor(table: string, id: string) {
    super(`Record ${id} not found in ${table}`);
    this.name = 'RecordNotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class LockError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LockError';
  }
}

export class SchemaPublishError extends Error {
  constructor(
    message: string,
    public readonly step?: string,
  ) {
    super(message);
    this.name = 'SchemaPublishError';
  }
}
