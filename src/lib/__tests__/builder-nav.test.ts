/**
 * Builder navigation helper tests
 */

import { builderPath } from '../builder-nav';

describe('builderPath', () => {
  it('returns correct path for section only', () => {
    expect(builderPath('app1', 'tables')).toBe('/builder/apps/app1/tables');
  });

  it('returns correct path with extra parts', () => {
    expect(builderPath('app1', 'fields', 'name')).toBe('/builder/apps/app1/fields/name');
  });

  it('handles multiple extra parts', () => {
    expect(builderPath('app1', 'settings', 'members', 'invite')).toBe(
      '/builder/apps/app1/settings/members/invite'
    );
  });

  it('works with any appId', () => {
    expect(builderPath('some-uuid-123', 'workflows')).toBe('/builder/apps/some-uuid-123/workflows');
  });

  it('no extra parts produces clean path', () => {
    const result = builderPath('x', 'themes');
    expect(result).toBe('/builder/apps/x/themes');
    expect(result.endsWith('/')).toBe(false);
  });
});
