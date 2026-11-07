/**
 * Tests for src/platform/scripts/library.ts
 *
 * Verifies all templates parse without syntax errors and their
 * test cases run against the mock SDK.
 */

import { SCRIPT_TEMPLATES } from '../../platform/scripts/library';
import { runScriptTests } from '../../platform/scripts/test-runner';

const baseContext = {
  trigger: 'manual' as const,
  userId: 'user-1',
  tenantSlug: 'acme',
  appId: 'app-1',
};

describe('SCRIPT_TEMPLATES', () => {
  test('all templates have required fields', () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      expect(tpl.id).toBeTruthy();
      expect(tpl.name).toBeTruthy();
      expect(tpl.code).toBeTruthy();
      expect(['data', 'notification', 'integration', 'report']).toContain(tpl.category);
    }
  });

  test('all template codes parse without syntax errors', () => {
    for (const tpl of SCRIPT_TEMPLATES) {
      expect(() => {
        // Wrap in async so `await` and bare `return` at top-level are valid
        // eslint-disable-next-line no-new-func
        new Function('input', 'novo', `return (async function __s__() {\n${tpl.code}\n})();`);
      }).not.toThrow();
    }
  });

  for (const tpl of SCRIPT_TEMPLATES) {
    if (!tpl.testCases || tpl.testCases.length === 0) continue;

    describe(`template: ${tpl.name}`, () => {
      test('all test cases pass', async () => {
        const results = await runScriptTests(tpl.code, tpl.testCases, baseContext, 8_000);
        const failures = results.filter((r) => !r.passed);
        if (failures.length > 0) {
          throw new Error(
            `Test case failures in template "${tpl.name}":\n` +
            failures.map((f) => `  - ${f.name}: ${f.error}`).join('\n')
          );
        }
        expect(failures).toHaveLength(0);
      }, 15_000);
    });
  }
});
