/**
 * NovoSDK — the public interface exposed to tenant scripts as the `novo` global.
 * ScriptContext carries the runtime execution context for the current script run.
 */

export interface NovoSDK {
  db: {
    /** Run a raw SQL query and return typed rows. */
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
    /** Insert a row into a table and return the created record. */
    insert(table: string, record: Record<string, unknown>): Promise<Record<string, unknown>>;
    /** Update specific fields of a row identified by id. */
    update(table: string, id: string, patch: Record<string, unknown>): Promise<void>;
    /** Delete a row identified by id. */
    delete(table: string, id: string): Promise<void>;
    /** Fetch a single row by id, or null if not found. */
    findById(table: string, id: string): Promise<Record<string, unknown> | null>;
    /** Fetch multiple rows with optional in-memory filtering. */
    findMany(
      table: string,
      filter?: Record<string, unknown>,
      opts?: { limit?: number; offset?: number; orderBy?: string }
    ): Promise<Record<string, unknown>[]>;
  };

  http: {
    get(url: string, opts?: { headers?: Record<string, string> }): Promise<{ status: number; body: unknown }>;
    post(
      url: string,
      body: unknown,
      opts?: { headers?: Record<string, string> }
    ): Promise<{ status: number; body: unknown }>;
  };

  email: {
    send(to: string, subject: string, html: string): Promise<void>;
  };

  whatsapp: {
    send(to: string, message: string): Promise<void>;
  };

  /** Append a log entry visible in the script run panel. */
  log(message: string, data?: unknown): void;

  /** Read a tenant secret / environment variable. Returns undefined if not set. */
  env(key: string): string | undefined;
}

export interface ScriptContext {
  /** What triggered this script run. */
  trigger: 'manual' | 'workflow' | 'schedule' | 'webhook';
  /** ID of the user who triggered the run (empty for scheduled/webhook). */
  userId: string;
  /** Slug of the tenant (used to scope DB queries to the right schema). */
  tenantSlug: string;
  /** ID of the builder app this script belongs to. */
  appId: string;
  /** The record that caused the trigger (workflow / event context). */
  record?: Record<string, unknown>;
  /** Arbitrary input payload passed at run time. */
  input?: Record<string, unknown>;
}
