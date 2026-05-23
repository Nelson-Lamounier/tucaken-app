/**
 * @format
 * Unit — initialiseFaroAdmin() wiring.
 *
 * Deterministic and offline: the Faro SDK is mocked and env + `window` are
 * stubbed, so this runs in the default `yarn test` (CI) lane. It covers the
 * gating logic and the collector-URL wiring that the live integration smoke
 * test (admin-api/__tests__/integration/faro-collector.test.ts) cannot assert
 * without a cluster.
 *
 * Source under test: src/lib/observability/faro-admin.ts
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoisted mock fns so we can assert calls across dynamic re-imports.
const mocks = vi.hoisted(() => ({
  initializeFaro: vi.fn((_config?: unknown) => ({ __faro: true })),
  getWebInstrumentations: vi.fn(() => []),
  TracingInstrumentation: vi.fn(),
}))

vi.mock('@grafana/faro-web-sdk', () => ({
  initializeFaro: mocks.initializeFaro,
  getWebInstrumentations: mocks.getWebInstrumentations,
}))
vi.mock('@grafana/faro-web-tracing', () => ({
  TracingInstrumentation: mocks.TracingInstrumentation,
}))

// Fresh module each test so the module-level singleton (`faroInstance`) resets.
async function loadInit() {
  return (await import('@/lib/observability/faro-admin')).initialiseFaroAdmin
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('initialiseFaroAdmin', () => {
  it('returns null when VITE_FARO_ENABLED is "false" (explicit kill switch)', async () => {
    vi.stubGlobal('window', {}) // browser present — isolate the disabled guard
    vi.stubEnv('VITE_FARO_ENABLED', 'false')
    vi.stubEnv('VITE_FARO_URL', '/faro/collect')

    const init = await loadInit()
    expect(init()).toBeNull()
    expect(mocks.initializeFaro).not.toHaveBeenCalled()
  })

  it('returns null during SSR (no window)', async () => {
    // window left unstubbed → undefined in the node test env
    vi.stubEnv('VITE_FARO_ENABLED', 'true')
    vi.stubEnv('VITE_FARO_URL', '/faro/collect')

    const init = await loadInit()
    expect(init()).toBeNull()
    expect(mocks.initializeFaro).not.toHaveBeenCalled()
  })

  it('returns null when VITE_FARO_URL is empty', async () => {
    vi.stubGlobal('window', {})
    vi.stubEnv('VITE_FARO_ENABLED', 'true')
    vi.stubEnv('VITE_FARO_URL', '')

    const init = await loadInit()
    expect(init()).toBeNull()
    expect(mocks.initializeFaro).not.toHaveBeenCalled()
  })

  it('initialises Faro with the configured collector URL in the browser', async () => {
    vi.stubGlobal('window', {})
    vi.stubEnv('VITE_FARO_ENABLED', 'true')
    vi.stubEnv('VITE_FARO_URL', '/faro/collect')
    vi.stubEnv('VITE_APP_VERSION', '1.2.3')

    const init = await loadInit()
    const instance = init()

    expect(instance).not.toBeNull()
    expect(mocks.initializeFaro).toHaveBeenCalledTimes(1)

    const cfg = mocks.initializeFaro.mock.calls[0]![0] as {
      url: string
      app: { name: string; version: string }
    }
    expect(cfg.url).toBe('/faro/collect')
    expect(cfg.app.name).toBe('portfolio-admin')
    expect(cfg.app.version).toBe('1.2.3')
  })

  it('is a singleton — repeated calls reuse the instance', async () => {
    vi.stubGlobal('window', {})
    vi.stubEnv('VITE_FARO_ENABLED', 'true')
    vi.stubEnv('VITE_FARO_URL', '/faro/collect')

    const init = await loadInit()
    const a = init()
    const b = init()

    expect(a).toBe(b)
    expect(mocks.initializeFaro).toHaveBeenCalledTimes(1)
  })
})
