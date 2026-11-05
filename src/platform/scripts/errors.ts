/**
 * Error classes for the tenant script sandbox.
 */

export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SandboxTimeoutError extends SandboxError {
  constructor(timeoutMs: number) {
    super(`Script exceeded CPU time limit of ${timeoutMs}ms`);
    this.name = 'SandboxTimeoutError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SandboxMemoryError extends SandboxError {
  constructor(limitMb: number) {
    super(`Script exceeded memory limit of ${limitMb}MB`);
    this.name = 'SandboxMemoryError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SandboxSecurityError extends SandboxError {
  constructor(message: string) {
    super(message);
    this.name = 'SandboxSecurityError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SsrfBlockedError extends SandboxError {
  constructor(url: string) {
    super(`SSRF blocked: ${url}`);
    this.name = 'SsrfBlockedError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
