import { describe, it, expect } from '@jest/globals';
import { deriveRepoSlug } from './projects.js';

describe('deriveRepoSlug', () => {
  it('lower-cases and dashes the full name (mirrors migration 031)', () => {
    expect(deriveRepoSlug('Nelson-Lamounier/cdk-monitoring'))
      .toBe('nelson-lamounier-cdk-monitoring');
  });
  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(deriveRepoSlug('Owner/My__Repo..Name')).toBe('owner-my-repo-name');
  });
  it('trims leading and trailing dashes', () => {
    expect(deriveRepoSlug('__weird__/__name__')).toBe('weird-name');
  });
});
