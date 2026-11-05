/**
 * src/platform/access/index.ts
 *
 * Public API for the access control layer.
 */

export { buildRlsPolicy, buildRlsPolicies } from './rls-builder';
export type { RlsSql } from './rls-builder';

export {
  applyFieldPermissions,
  applyFieldPermissionsToRows,
  getHiddenFields,
  getReadOnlyFields,
} from './field-filter';

export { LocationManager } from './location-manager';
export type { PgClient } from './location-manager';

export { OverrideManager } from './override-manager';

export { PolicyManager } from './policy-manager';

export {
  injectRlsContext,
  clearRlsContext,
  withRlsContext,
} from './middleware';

export { NotConfiguredError } from './location-manager';
