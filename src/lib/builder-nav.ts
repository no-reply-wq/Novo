/**
 * Builder navigation helpers
 */

/**
 * Builds a path within the builder at /apps/[appId]/[section]/[...parts]
 *
 * @example
 * builderPath('app1', 'tables')           → '/apps/app1/tables'
 * builderPath('app1', 'fields', 'name')   → '/apps/app1/fields/name'
 */
export function builderPath(appId: string, section: string, ...parts: string[]): string {
  const segments = ['/apps', appId, section, ...parts].filter(Boolean);
  return segments.join('/');
}
