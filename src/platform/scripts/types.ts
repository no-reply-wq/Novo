/**
 * Public types for the tenant script sandbox.
 * Re-exports from contracts where possible; adds sandbox-specific additions.
 */

export interface TenantScript {
  id: string;
  appId: string;
  name: string;
  description?: string;
  code: string;             // JavaScript function body
  inputSchema: ScriptParam[];
  outputSchema: ScriptParam[];
  timeoutMs: number;        // default 2000, max 5000
  memoryLimitMb: number;    // default 32, max 128
  version: number;
  isActive: boolean;
  testCases: ScriptTestCase[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ScriptParam {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  required: boolean;
  description?: string;
}

export interface ScriptTestCase {
  id: string;
  name: string;
  input: Record<string, unknown>;
  expectedOutput?: unknown;
  lastResult?: { output: unknown; duration: number; passed: boolean };
}

export interface ScriptRunResult {
  output: unknown;
  duration: number;    // ms
  memoryUsed?: number; // bytes
  logs: string[];      // console.log output captured
}
