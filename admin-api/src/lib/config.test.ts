/** @format */
import { describe, it, expect } from '@jest/globals';
import { loadConfig } from './config.js';

/** Minimal set of required env vars so loadConfig() does not throw. */
const REQUIRED = {
  COGNITO_USER_POOL_ID: 'pool',
  COGNITO_CLIENT_ID:    'client',
  COGNITO_ISSUER_URL:   'https://issuer',
  AWS_DEFAULT_REGION:   'eu-west-1',
  PG_HOST:              'host',
  PG_PORT:              '5432',
  PG_DATABASE:          'db',
  PG_USER:              'user',
  PG_PASSWORD:          'pw',
  RESEARCH_MODEL:       'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
} as const;

/** Run fn with REQUIRED + extra applied to process.env; keys set to undefined are deleted. */
function withEnv(extra: Record<string, string | undefined>, fn: () => void): void {
  const saved = { ...process.env };
  Object.assign(process.env, REQUIRED);
  for (const [k, v] of Object.entries(extra)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    process.env = saved;
  }
}

describe('loadConfig — coachModel', () => {
  it('defaults to Claude Sonnet 4.6 when COACH_MODEL is unset', () => {
    withEnv({ COACH_MODEL: undefined }, () => {
      expect(loadConfig().coachModel).toBe('eu.anthropic.claude-sonnet-4-6');
    });
  });

  it('respects an explicit COACH_MODEL override', () => {
    withEnv({ COACH_MODEL: 'eu.anthropic.claude-opus-4-8' }, () => {
      expect(loadConfig().coachModel).toBe('eu.anthropic.claude-opus-4-8');
    });
  });
});

describe('loadConfig — strategistResearchModel', () => {
  it('defaults to Claude Sonnet 4.6 when STRATEGIST_RESEARCH_MODEL is unset', () => {
    withEnv({ STRATEGIST_RESEARCH_MODEL: undefined }, () => {
      expect(loadConfig().strategistResearchModel).toBe('eu.anthropic.claude-sonnet-4-6');
    });
  });

  it('respects an explicit STRATEGIST_RESEARCH_MODEL override', () => {
    withEnv({ STRATEGIST_RESEARCH_MODEL: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0' }, () => {
      expect(loadConfig().strategistResearchModel).toBe('eu.anthropic.claude-haiku-4-5-20251001-v1:0');
    });
  });

  it('is independent of RESEARCH_MODEL (article pipeline stays on its own value)', () => {
    withEnv({ RESEARCH_MODEL: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0', STRATEGIST_RESEARCH_MODEL: undefined }, () => {
      const cfg = loadConfig();
      expect(cfg.researchModel).toBe('eu.anthropic.claude-haiku-4-5-20251001-v1:0');
      expect(cfg.strategistResearchModel).toBe('eu.anthropic.claude-sonnet-4-6');
    });
  });
});
