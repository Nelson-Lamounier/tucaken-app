// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({ trackFormSubmission: vi.fn() }))
vi.mock('../../../lib/observability/analytics', async (orig) => {
  const actual = await orig<typeof import('../../../lib/observability/analytics')>()
  return { ...actual, trackFormSubmission: mocks.trackFormSubmission }
})

import { withFormTracking } from '../../../lib/observability/with-form-tracking'

beforeEach(() => vi.clearAllMocks())

describe('withFormTracking', () => {
  it('fires success and returns the resolved value', async () => {
    const result = await withFormTracking('sign_in', async () => 'ok')
    expect(result).toBe('ok')
    expect(mocks.trackFormSubmission).toHaveBeenCalledWith('sign_in', 'success')
  })

  it('fires error and rethrows when run throws', async () => {
    const boom = new Error('bad creds')
    await expect(
      withFormTracking('sign_up', async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
    expect(mocks.trackFormSubmission).toHaveBeenCalledWith('sign_up', 'error')
  })
})
