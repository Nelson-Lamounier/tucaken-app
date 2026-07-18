import { describe, it, expect } from 'vitest'
import {
  pruneStaleRunning,
  STALE_RUNNING_MAX_AGE_MS,
  type PipelineNotification,
} from '@/lib/stores/pipeline-notifications-store'

/**
 * Regression guard for the notification-stampede incident: localStorage kept
 * 'running' entries forever, so every page load mounted one detail-polling
 * watcher per stale entry (~24 concurrent requests → pool saturation → 5 s
 * connect timeouts). Entries running longer than the poll timeout can never
 * legitimately complete and must be dropped on rehydrate.
 */

const NOW = 1_800_000_000_000

const notif = (over: Partial<PipelineNotification>): PipelineNotification => ({
  id: 'n1',
  userId: 'u1',
  type: 'application',
  slug: 'app-1',
  label: 'app-1',
  status: 'running',
  link: '/applications/app-1',
  createdAt: NOW,
  read: false,
  ...over,
})

describe('pruneStaleRunning', () => {
  it('keeps fresh running notifications', () => {
    const kept = pruneStaleRunning([notif({ createdAt: NOW - 60_000 })], NOW)
    expect(kept).toHaveLength(1)
  })

  it('drops running notifications older than the stale ceiling', () => {
    const kept = pruneStaleRunning(
      [notif({ createdAt: NOW - STALE_RUNNING_MAX_AGE_MS - 1 })],
      NOW,
    )
    expect(kept).toHaveLength(0)
  })

  it('never drops terminal notifications regardless of age', () => {
    const kept = pruneStaleRunning(
      [
        notif({ id: 'a', status: 'complete', createdAt: NOW - 10 * STALE_RUNNING_MAX_AGE_MS }),
        notif({ id: 'b', status: 'failed', createdAt: NOW - 10 * STALE_RUNNING_MAX_AGE_MS }),
        notif({ id: 'c', status: 'review', createdAt: NOW - 10 * STALE_RUNNING_MAX_AGE_MS }),
      ],
      NOW,
    )
    expect(kept).toHaveLength(3)
  })

  it('the ceiling exceeds the 20-minute client poll timeout', () => {
    expect(STALE_RUNNING_MAX_AGE_MS).toBeGreaterThan(20 * 60_000)
  })
})
