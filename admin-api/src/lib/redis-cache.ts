/**
 * @format
 * admin-api read-cache invalidation. admin-api is the WRITER for cross-app
 * cached entities — it only DELs keys (no read-through here). Fail-open: a
 * down/slow Redis must never break a write. The key format is a strict
 * cross-repo contract with @bedrock/shared's projectCaseStudyKey (locked by
 * test). See docs/decisions/redis-read-cache-shared-key-invalidation.md.
 */
import { Redis, type RedisOptions } from 'ioredis';

import { redisCacheInvalidationsTotal } from './observability/metrics.js';

const CACHE_NAME = 'project_case_study';

interface DelClient { del(...keys: string[]): Promise<number>; }

function projectCaseStudyKey(projectId: string): string {
  return `shared:project:case_study:${projectId}:v1`;
}

let _client: DelClient | undefined;
let _enabled: boolean | undefined;

function client(): DelClient | undefined {
  if (_enabled === undefined) {
    const host = process.env['REDIS_CACHE_HOST'] ?? '';
    _enabled = host !== '';            // set first — a concurrent caller now skips the construct branch
    if (_enabled) {
      const opts: RedisOptions = {
        host,
        port: Number(process.env['REDIS_CACHE_PORT'] ?? '6379'),
        password: process.env['REDIS_CACHE_PASSWORD'] || undefined,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 1000,
        commandTimeout: 200,
        ...((process.env['REDIS_CACHE_TLS'] ?? 'false') === 'true' ? { tls: {} } : {}),
      };
      const c = new Redis(opts);
      c.on('error', () => { /* fail-open */ });
      _client = c as unknown as DelClient;
    }
  }
  return _enabled ? _client : undefined;
}

async function invalidateProjectWith(
  c: DelClient | undefined,
  projectId: string,
  count: (l: { cache: string; result: 'ok' | 'error' }) => void,
): Promise<void> {
  if (!c) return; // disabled — no-op
  try {
    await c.del(projectCaseStudyKey(projectId));
    count({ cache: CACHE_NAME, result: 'ok' });
  } catch {
    count({ cache: CACHE_NAME, result: 'error' });
  }
}

/** Invalidate one project's public read-cache entry. Fail-open. */
export async function invalidateProject(projectId: string): Promise<void> {
  await invalidateProjectWith(client(), projectId, (l) =>
    redisCacheInvalidationsTotal.inc(l),
  );
}

export const __test = { projectCaseStudyKey, invalidateProjectWith };
