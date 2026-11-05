/**
 * Workflow-specific error classes.
 */

export class WorkflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export class WorkflowTimeoutError extends WorkflowError {
  constructor(timeoutSeconds: number) {
    super(`Workflow timed out after ${timeoutSeconds}s`);
    this.name = 'WorkflowTimeoutError';
  }
}

export class WorkflowLoopError extends WorkflowError {
  constructor(maxIterations: number) {
    super(`Workflow exceeded max loop iterations (${maxIterations})`);
    this.name = 'WorkflowLoopError';
  }
}

export class NotConfiguredError extends WorkflowError {
  constructor(feature: string) {
    super(`${feature} is not configured`);
    this.name = 'NotConfiguredError';
  }
}
