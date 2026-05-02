#!/usr/bin/env node
/**
 * scripts/local-dev.ts — tucaken-app local image test harness
 *
 * Builds and runs the tucaken-app Docker image and wires it to an
 * already-running admin-api container so it can reach it via Docker DNS —
 * replicating K8s pod-to-pod networking.
 *
 * Admin-api lifecycle is NOT managed here.
 * Use `just admin-api-up` in the cdk-monitoring repo first.
 *
 * Network wiring:
 *   K8s production:  tucaken-app → http://admin-api.admin-api:3002
 *   Local (this):    tucaken-app → http://admin-api:3002  (Docker DNS alias)
 *   Achieved via:    docker network connect --alias admin-api
 *
 * Usage:
 *   npx tsx scripts/local-dev.ts              # Stop → build → start
 *   npx tsx scripts/local-dev.ts --no-rebuild # Use cached image (faster)
 *   npx tsx scripts/local-dev.ts --logs       # + tail logs after startup
 *   npx tsx scripts/local-dev.ts --stop       # Stop and remove the container
 *
 * Prerequisites:
 *   - Docker Desktop or colima running
 *   - admin-api container already running locally
 *     (run `just admin-api-up` in cdk-monitoring repo)
 *   - .env.local at repo root with Cognito + other vars
 */

import { spawnSync, spawn } from 'node:child_process'
import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

// =============================================================================
// Config
// =============================================================================

const __filename = fileURLToPath(import.meta.url)
const REPO_ROOT = resolve(__filename, '../..')

const APP_IMAGE     = 'tucaken-app:local'
const APP_CONTAINER = 'tucaken-app-local'
const APP_PORT      = 5001

// Shared network — tucaken-app uses this to reach admin-api
const NETWORK_NAME = 'local-cluster'

// admin-api container (managed by cdk-monitoring, already running)
const ADMIN_API_CONTAINER = 'admin-api-admin-api-1'
const ADMIN_API_ALIAS     = 'admin-api'
const ADMIN_API_PORT      = 3002

const HOME_DIR    = process.env['HOME'] ?? '/root'
const AWS_PROFILE = process.env['AWS_PROFILE'] ?? 'dev-account'

// =============================================================================
// CLI flags
// =============================================================================

const argv       = process.argv.slice(2)
const NO_REBUILD = argv.includes('--no-rebuild')
const TAIL_LOGS  = argv.includes('--logs')
const STOP_ONLY  = argv.includes('--stop')

// =============================================================================
// Colours
// =============================================================================

const C = {
  reset:   '\x1b[0m',
  bold:    '\x1b[1m',
  dim:     '\x1b[2m',
  red:     '\x1b[31m',
  green:   '\x1b[32m',
  yellow:  '\x1b[33m',
  blue:    '\x1b[34m',
  magenta: '\x1b[35m',
  cyan:    '\x1b[36m',
}

const log = {
  info:  (msg: string) => console.log(`  ${C.blue}›${C.reset} ${msg}`),
  ok:    (msg: string) => console.log(`  ${C.green}✓${C.reset} ${msg}`),
  warn:  (msg: string) => console.log(`  ${C.yellow}⚠${C.reset}  ${msg}`),
  error: (msg: string) => console.error(`  ${C.red}✗${C.reset} ${msg}`),
  step:  (n: number, msg: string) =>
    console.log(`\n${C.bold}${C.cyan} ${n}. ${msg}${C.reset}`),
  cmd: (prog: string, args: string[]) =>
    console.log(`  ${C.dim}$ ${prog} ${args.join(' ')}${C.reset}`),
}

// =============================================================================
// Exec helpers — explicit args arrays, no shell string interpolation
// =============================================================================

function run(prog: string, args: string[], opts: { cwd?: string } = {}): void {
  log.cmd(prog, args)
  const r = spawnSync(prog, args, { stdio: 'inherit', cwd: opts.cwd ?? REPO_ROOT })
  if (r.status !== 0) {
    throw new Error(`Failed (exit ${r.status ?? 'null'}): ${prog} ${args.join(' ')}`)
  }
}

function capture(prog: string, args: string[]): string {
  const r = spawnSync(prog, args, { stdio: 'pipe' })
  if (!r.stdout) return ''
  return r.stdout.toString().trim()
}

// =============================================================================
// Docker helpers
// =============================================================================

function containerExists(name: string): boolean {
  return capture('docker', ['ps', '-aq', '-f', `name=^${name}$`]).length > 0
}

function containerRunning(name: string): boolean {
  return capture('docker', ['inspect', '-f', '{{.State.Running}}', name]) === 'true'
}

function networkExists(name: string): boolean {
  return capture('docker', ['network', 'ls', '-q', '-f', `name=^${name}$`]).length > 0
}

function connectedToNetwork(container: string, network: string): boolean {
  const nets = capture('docker', [
    'inspect', container,
    '-f', '{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}',
  ])
  return nets.split(/\s+/).includes(network)
}

function healthStatus(container: string): string {
  return capture('docker', ['inspect', '-f', '{{.State.Health.Status}}', container])
}

function waitHealthy(container: string, label: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs
    const iv = setInterval(() => {
      const status = healthStatus(container)
      if (status === 'healthy') {
        clearInterval(iv)
        resolve()
        return
      }
      if (Date.now() >= deadline) {
        clearInterval(iv)
        const tail = capture('docker', ['logs', '--tail', '20', container])
        reject(new Error(
          `${label} did not become healthy within ${timeoutMs / 1000}s (status: "${status}")\n` +
          `Last logs:\n${tail}`,
        ))
      }
    }, 2_500)
  })
}

// =============================================================================
// Env file helpers
// =============================================================================

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const env: Record<string, string> = {}
  for (const raw of readFileSync(path, 'utf-8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const val = line.slice(idx + 1).trim().replace(/^(["'])(.*)(\1)$/, '$2')
    env[key] = val
  }
  return env
}

function writeTempEnvFile(env: Record<string, string>): string {
  const path = join(tmpdir(), `tucaken-app-local-${Date.now()}.env`)
  writeFileSync(path, Object.entries(env).map(([k, v]) => `${k}=${v}`).join('\n'), 'utf-8')
  return path
}

// =============================================================================
// Stop
// =============================================================================

function stopApp(stepNum: number): void {
  log.step(stepNum, 'Stop existing container')
  if (containerExists(APP_CONTAINER)) {
    run('docker', ['rm', '-f', APP_CONTAINER])
    log.ok(`Removed ${APP_CONTAINER}`)
  } else {
    log.info(`${APP_CONTAINER} not running — skip`)
  }
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log(`\n${C.bold}${C.magenta}┌──────────────────────────────────────────────────┐`)
  console.log(`│   tucaken-app local image                       │`)
  console.log(`└──────────────────────────────────────────────────┘${C.reset}`)

  if (STOP_ONLY) {
    stopApp(0)
    log.ok('Done')
    return
  }

  // ── 1. Pre-flight ──────────────────────────────────────────────────────────
  log.step(1, 'Pre-flight checks')

  if (!containerRunning(ADMIN_API_CONTAINER)) {
    log.warn(`admin-api container "${ADMIN_API_CONTAINER}" is not running.`)
    log.warn('Run `just admin-api-up` in the cdk-monitoring repo first.')
    log.warn('Continuing — tucaken-app will start but API calls will fail.')
  } else {
    log.ok(`admin-api running (${ADMIN_API_CONTAINER})`)
  }

  const awsDir = `${HOME_DIR}/.aws`
  if (existsSync(awsDir)) {
    log.ok('~/.aws found — will mount read-only into container')
  } else {
    log.warn('~/.aws not found — AWS SDK calls will fail inside container')
  }

  const envPath = join(REPO_ROOT, '.env.local')
  const appEnv = parseEnvFile(envPath)
  if (Object.keys(appEnv).length === 0) {
    log.warn('.env.local not found at repo root — Cognito auth will fail')
  } else {
    log.ok(`Loaded ${Object.keys(appEnv).length} vars from .env.local`)
  }

  // ── 2. Stop existing container ────────────────────────────────────────────
  stopApp(2)

  // ── 3. Ensure shared network ───────────────────────────────────────────────
  log.step(3, `Ensure network: ${C.cyan}${NETWORK_NAME}${C.reset}`)
  if (!networkExists(NETWORK_NAME)) {
    run('docker', ['network', 'create', NETWORK_NAME])
    log.ok(`Created ${NETWORK_NAME}`)
  } else {
    log.ok(`Network ${NETWORK_NAME} already exists`)
  }

  if (containerRunning(ADMIN_API_CONTAINER)) {
    if (!connectedToNetwork(ADMIN_API_CONTAINER, NETWORK_NAME)) {
      run('docker', [
        'network', 'connect',
        '--alias', ADMIN_API_ALIAS,
        NETWORK_NAME,
        ADMIN_API_CONTAINER,
      ])
      log.ok(`admin-api joined ${NETWORK_NAME} as alias "${ADMIN_API_ALIAS}"`)
    } else {
      log.ok(`admin-api already on ${NETWORK_NAME}`)
    }
  }

  // ── 4. Build image ─────────────────────────────────────────────────────────
  let stepN = 4
  if (!NO_REBUILD) {
    log.step(stepN++, 'Build tucaken-app image')
    run('docker', [
      'build',
      '-f', join(REPO_ROOT, 'Dockerfile'),
      '-t', APP_IMAGE,
      REPO_ROOT,
    ])
    log.ok(`Built ${APP_IMAGE}`)
  } else {
    log.step(stepN++, 'Image build skipped (--no-rebuild)')
    if (!capture('docker', ['image', 'inspect', APP_IMAGE, '-f', '{{.Id}}'])) {
      log.error(`Image ${APP_IMAGE} not found — run without --no-rebuild first`)
      process.exit(1)
    }
    log.ok(`Cached: ${APP_IMAGE}`)
  }

  // ── 5. Start container ─────────────────────────────────────────────────────
  log.step(stepN++, `Start tucaken-app (port ${APP_PORT})`)

  const containerEnv: Record<string, string> = {
    NODE_ENV: 'production',
    PORT: String(APP_PORT),
    HOST: '0.0.0.0',
    // Pod-to-pod URL: Docker DNS resolves "admin-api" via local-cluster network
    // mirrors K8s:  http://admin-api.admin-api:3002
    ADMIN_API_URL: `http://${ADMIN_API_ALIAS}:${ADMIN_API_PORT}`,
    AWS_PROFILE,
    AWS_DEFAULT_REGION: appEnv['AWS_DEFAULT_REGION'] ?? 'eu-west-1',
    AWS_REGION:         appEnv['AWS_REGION']         ?? 'eu-west-1',
    VITE_APP_URL: `http://localhost:${APP_PORT}`,
    OTEL_SDK_DISABLED: 'true',
    NEXT_TELEMETRY_DISABLED: '1',
  }
  const LOCKED = new Set(Object.keys(containerEnv))
  for (const [k, v] of Object.entries(appEnv)) {
    if (!LOCKED.has(k)) containerEnv[k] = v
  }

  log.ok(`ADMIN_API_URL → ${containerEnv['ADMIN_API_URL']}`)

  const tmpEnv = writeTempEnvFile(containerEnv)

  const dockerArgs: string[] = [
    'run', '-d',
    '--name', APP_CONTAINER,
    '--network', NETWORK_NAME,
    '-p', `${APP_PORT}:${APP_PORT}`,
    '--env-file', tmpEnv,
  ]
  if (existsSync(awsDir)) {
    dockerArgs.push('-v', `${awsDir}:/home/startadmin/.aws:ro`)
  }
  dockerArgs.push(APP_IMAGE)

  run('docker', dockerArgs)
  try { unlinkSync(tmpEnv) } catch { /* ignore */ }
  log.ok(`${APP_CONTAINER} started → http://localhost:${APP_PORT}/`)

  // ── 6. Health check ────────────────────────────────────────────────────────
  log.step(stepN++, 'Waiting for health check')

  try {
    await waitHealthy(APP_CONTAINER, 'tucaken-app', 120_000)
    log.ok(`tucaken-app healthy → http://localhost:${APP_PORT}/`)
  } catch (err) {
    log.error((err as Error).message)
    process.exit(1)
  }

  // ── 7. Summary ─────────────────────────────────────────────────────────────
  console.log(`\n${C.bold}${C.green}┌──────────────────────────────────────────────────┐`)
  console.log(`│   ✓  tucaken-app running                        │`)
  console.log(`└──────────────────────────────────────────────────┘${C.reset}`)
  console.log('')
  console.log(`  ${C.bold}tucaken-app${C.reset}   http://localhost:${APP_PORT}/`)
  console.log(`               → admin-api:${ADMIN_API_PORT}  (Docker DNS on ${NETWORK_NAME})`)
  console.log('')
  console.log(`  ${C.dim}Logs:`)
  console.log(`    docker logs -f ${APP_CONTAINER}`)
  console.log(`  Stop:`)
  console.log(`    npx tsx scripts/local-dev.ts --stop${C.reset}`)
  console.log('')

  // ── 8. Optional log tail ───────────────────────────────────────────────────
  if (TAIL_LOGS) {
    console.log(`${C.bold}${C.cyan} Tailing logs — Ctrl+C to detach${C.reset}\n`)

    const p = spawn('docker', ['logs', '-f', '--tail', '30', APP_CONTAINER], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    const prefix = (chunk: Buffer) => {
      for (const line of chunk.toString().split('\n').filter(Boolean)) {
        process.stdout.write(`${C.cyan}[tucaken-app]${C.reset} ${line}\n`)
      }
    }
    p.stdout?.on('data', prefix)
    p.stderr?.on('data', prefix)

    await new Promise<void>((resolve) => {
      process.on('SIGINT', () => {
        p.kill()
        console.log('\nDetached.')
        resolve()
      })
    })
  }
}

main().catch((err: unknown) => {
  log.error(String(err instanceof Error ? err.stack ?? err.message : err))
  process.exit(1)
})
