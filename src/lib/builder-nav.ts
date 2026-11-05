/**
 * Builder navigation helpers
 */

/**
 * Builds a path within the builder at /builder/apps/[appId]/[section]/[...parts]
 *
 * @example
 * builderPath('app1', 'tables')           → '/builder/apps/app1/tables'
 * builderPath('app1', 'fields', 'name')   → '/builder/apps/app1/fields/name'
 */
export function builderPath(appId: string, section: string, ...parts: string[]): string {
  const segments = ['/builder/apps', appId, section, ...parts].filter(Boolean);
  return segments.join('/');
}
