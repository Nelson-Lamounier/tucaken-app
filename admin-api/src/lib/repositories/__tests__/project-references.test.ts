import { describe, it, expect } from '@jest/globals';
import { rankProjectsForSkills, type ProjectRefIndex } from '../project-references.js';

function index(over: Partial<{
  projects: { id: string; name: string; tagline: string | null; pitch: string | null; lastActivityAt: string | null }[];
  stack: Record<string, string[]>;
  tags: Record<string, string[]>;
}> = {}): ProjectRefIndex {
  return {
    projects: over.projects ?? [],
    stackByProject: new Map(Object.entries(over.stack ?? {})),
    tagsByProject: new Map(Object.entries(over.tags ?? {})),
  };
}

describe('rankProjectsForSkills', () => {
  const projects = [
    { id: 'a', name: 'Tucaken', tagline: 'Multi-agent platform', pitch: 'AI platform. More.', lastActivityAt: '2026-01-01' },
    { id: 'b', name: 'Portfolio', tagline: null, pitch: null, lastActivityAt: '2026-02-01' },
  ];

  it('matches a skill to projects via stack items', () => {
    const out = rankProjectsForSkills(
      index({ projects, stack: { a: ['Kubernetes', 'TypeScript'], b: ['React'] } }),
      ['Kubernetes'],
    );
    expect(out['kubernetes']).toHaveLength(1);
    expect(out['kubernetes'][0].id).toBe('a');
    expect(out['kubernetes'][0].highlights).toContain('Kubernetes');
  });

  it('does not false-match a short skill as a substring (go ⋈ mongodb)', () => {
    const out = rankProjectsForSkills(
      index({ projects, stack: { a: ['MongoDB'] } }),
      ['Go'],
    );
    expect(out['go']).toBeUndefined();
  });

  it('matches multi-word skills by phrase', () => {
    const out = rankProjectsForSkills(
      index({ projects, tags: { a: ['distributed systems'] } }),
      ['Distributed Systems'],
    );
    expect(out['distributed systems']?.[0].id).toBe('a');
  });

  it('ranks stack matches above name matches and dedupes skills', () => {
    const out = rankProjectsForSkills(
      index({
        projects,
        stack: { b: ['GraphQL'] },     // stack hit (score 2)
        tags: {},
      }),
      ['GraphQL', 'graphql'],          // duplicate skill collapsed
    );
    expect(Object.keys(out)).toEqual(['graphql']);
    expect(out['graphql'][0].id).toBe('b');
  });

  it('returns nothing when no project matches', () => {
    expect(rankProjectsForSkills(index({ projects }), ['Rust'])).toEqual({});
  });
});
