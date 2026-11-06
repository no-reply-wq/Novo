/**
 * Integration types for the platform-level integration configs.
 *
 * These sit at the platform layer (platform.integration_configs table),
 * keyed by tenant_slug rather than app_id — a single integration can
 * be shared across all apps of a tenant.
 */

export type IntegrationType =
  | 'smtp'
  | 'ses'
  | 'resend'
  | 'whatsapp_meta'
  | 's3'
  | 'r2'
  | 'rest'
  | 'postgres'
  | 'mysql'
  | 'sheets'
  | 'bigquery';

export interface IntegrationConfig {
  id: string;
  tenantSlug: string;
  type: IntegrationType;
  name: string;
  /** Encrypted at rest — values must pass through encryptSecret / decryptSecret */
  config: Record<string, string>;
  enabled: boolean;
}
