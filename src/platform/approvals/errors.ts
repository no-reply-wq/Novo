/**
 * Error classes for the approvals engine.
 */

export class ApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApprovalError';
  }
}

export class ApprovalNotFoundError extends ApprovalError {
  constructor(requestId: string) {
    super(`Approval request not found: ${requestId}`);
    this.name = 'ApprovalNotFoundError';
  }
}

export class ApprovalUnauthorizedError extends ApprovalError {
  constructor(userId: string, level: number) {
    super(`User ${userId} is not authorized to decide on approval level ${level}`);
    this.name = 'ApprovalUnauthorizedError';
  }
}

export class ApprovalAlreadyDecidedError extends ApprovalError {
  constructor(requestId: string, status: string) {
    super(`Approval request ${requestId} has already been decided (status: ${status})`);
    this.name = 'ApprovalAlreadyDecidedError';
  }
}
