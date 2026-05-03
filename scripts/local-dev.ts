#!/usr/bin/env node
/**
 * scripts/local-dev.ts — tucaken-app local image test harness
 *
 * Two modes:
 *
 *   Default (local Docker)
 *     Wires tucaken-app to an already-running admin-api Docker container via
 *     a shared Docker network, replicating K8s pod-to-pod DNS.
 *     Network wiring:
 *       K8s production:  tucaken-app → http://admin-api.admin-api:3002
 *       Local (this):    tucaken-app → http://admin-api:3002  (Docker DNS alias)
 *     Prerequisites: `just admin-api-up` in the cdk-monitoring repo.
 *
 *   --cluster (port-forward from dev cluster)
 *     Opens a kubectl port-forward to the admin-api Service in the cluster and
 *     runs tucaken-app pointing at host.docker.internal:3002.  No local
 *     admin-api container needed — uses the real dev pod.
 *     Prerequisites: valid kubeconfig + access to the development cluster.
 *
 * Usage:
 *   npx tsx scripts/local-dev.ts                        # local Docker mode
 *   npx tsx scripts/local-dev.ts --no-rebuild           # skip image build
 *   npx tsx scripts/local-dev.ts --logs                 # tail logs after start
 *   npx tsx scripts/local-dev.ts --stop                 # stop container
 *   npx tsx scripts/local-dev.ts --cluster              # cluster port-forward
 *   npx tsx scripts/local-dev.ts --cluster --no-rebuild # cluster, cached image
 *   npx tsx scripts/local-dev.ts --cluster --logs       # cluster + tail logs
 *   npx tsx scripts/local-dev.ts --cluster --stop       # stop container + pf
 */

import { spawnSync, spawn, type ChildProcess } from 'node:child_process'
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

// K8s cluster port-forward config (--cluster mode)
const K8S_NAMESPACE        = 'admin-api'
const K8S_SERVICE          = 'admin-api'
const K8S_LOCAL_PORT       = 3002
const PF_PID_FILE          = join(tmpdir(), 'tucaken-app-pf.pid')

const HOME_DIR    = process.env['HOME'] ?? '/root'
const AWS_PROFILE = process.env['AWS_PROFILE'] ?? 'dev-account'

// =============================================================================
// CLI flags
// =============================================================================

const argv       = process.argv.slice(2)
const NO_REBUILD = argv.includes('--no-rebuild')
const TAIL_LOGS  = argv.includes('--logs')
const STOP_ONLY  = argv.includes('--stop')
const CLUSTER    = argv.includes('--cluster')

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
// Port-forward helpers (--cluster mode)
// =============================================================================

function killPortForward(): void {
  if (!existsSync(PF_PID_FILE)) return
  const pid = parseInt(readFileSync(PF_PID_FILE, 'utf-8').trim(), 10)
  if (!isNaN(pid)) {
    try {
      process.kill(pid, 'SIGTERM')
      log.ok(`Stopped port-forward (PID ${pid})`)
    } catch {
      // Already gone
    }
  }
  try { unlinkSync(PF_PID_FILE) } catch { /* ignore */ }
}

function startPortForward(): Promise<void> {
  return new Promise((resolve, reject) => {
    log.info(`kubectl port-forward svc/${K8S_SERVICE} ${K8S_LOCAL_PORT}:${K8S_LOCAL_PORT} -n ${K8S_NAMESPACE}`)

    const pf: ChildProcess = spawn(
      'kubectl',
      ['port-forward', `svc/${K8S_SERVICE}`, `${K8S_LOCAL_PORT}:${K8S_LOCAL_PORT}`, '-n', K8S_NAMESPACE],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    )

    if (pf.pid) {
      writeFileSync(PF_PID_FILE, String(pf.pid), 'utf-8')
    }

    const deadline = setTimeout(() => {
      reject(new Error(`Port-forward did not become ready within 15s`))
    }, 15_000)

    pf.stdout?.on('data', (chunk: Buffer) => {
      const line = chunk.toString()
      // kubectl prints "Forwarding from 127.0.0.1:3002 -> 3002" when ready
      if (line.includes('Forwarding from')) {
        clearTimeout(deadline)
        log.ok(`Port-forward ready → localhost:${K8S_LOCAL_PORT}`)
        resolve()
      }
    })

    pf.stderr?.on('data', (chunk: Buffer) => {
      const line = chunk.toString().trim()
      if (line) log.warn(`[pf] ${line}`)
    })

    pf.on('exit', (code) => {
      clearTimeout(deadline)
      if (code !== 0 && code !== null) {
        reject(new Error(`Port-forward exited unexpectedly (code ${code})`))
      }
    })
  })
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
  if (CLUSTER) {
    killPortForward()
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

  if (CLUSTER) {
    log.info('Mode: cluster port-forward')
    const kctx = capture('kubectl', ['config', 'current-context'])
    if (kctx) {
      log.ok(`kubectl context: ${kctx}`)
    } else {
      log.warn('kubectl context not found — ensure kubeconfig is set')
    }
  } else {
    if (!containerRunning(ADMIN_API_CONTAINER)) {
      log.warn(`admin-api container "${ADMIN_API_CONTAINER}" is not running.`)
      log.warn('Run `just admin-api-up` in the cdk-monitoring repo first.')
      log.warn('Continuing — tucaken-app will start but API calls will fail.')
    } else {
      log.ok(`admin-api running (${ADMIN_API_CONTAINER})`)
    }
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

  // ── 2. Stop existing container (+ port-forward if cluster mode) ───────────
  stopApp(2)

  // ── 3. Network / port-forward setup ───────────────────────────────────────
  let stepN = 3
  if (CLUSTER) {
    log.step(stepN++, `Port-forward svc/${K8S_SERVICE} -n ${K8S_NAMESPACE} → localhost:${K8S_LOCAL_PORT}`)
    await startPortForward()
  } else {
    log.step(stepN++, `Ensure network: ${C.cyan}${NETWORK_NAME}${C.reset}`)
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
  }

  // ── 4. Build image ─────────────────────────────────────────────────────────
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

  // In cluster mode: container reaches the forwarded port via host.docker.internal
  // In local mode:   Docker DNS alias "admin-api" resolves via the shared network
  const adminApiUrl = CLUSTER
    ? `http://host.docker.internal:${K8S_LOCAL_PORT}`
    : `http://${ADMIN_API_ALIAS}:${ADMIN_API_PORT}`

  const containerEnv: Record<string, string> = {
    NODE_ENV: 'production',
    PORT: String(APP_PORT),
    HOST: '0.0.0.0',
    ADMIN_API_URL: adminApiUrl,
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
    '-p', `${APP_PORT}:${APP_PORT}`,
    '--env-file', tmpEnv,
  ]
  // cluster mode: no shared Docker network needed — reaches host via host.docker.internal
  if (!CLUSTER) {
    dockerArgs.splice(4, 0, '--network', NETWORK_NAME)
  }
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
  const stopCmd = CLUSTER
    ? 'just local-cluster-stop'
    : 'just local-stop'
  const apiLine = CLUSTER
    ? `→ admin-api (cluster pf → host.docker.internal:${K8S_LOCAL_PORT})`
    : `→ admin-api:${ADMIN_API_PORT}  (Docker DNS on ${NETWORK_NAME})`

  console.log(`\n${C.bold}${C.green}┌──────────────────────────────────────────────────┐`)
  console.log(`│   ✓  tucaken-app running                        │`)
  console.log(`└──────────────────────────────────────────────────┘${C.reset}`)
  console.log('')
  console.log(`  ${C.bold}tucaken-app${C.reset}   http://localhost:${APP_PORT}/`)
  console.log(`               ${apiLine}`)
  console.log('')
  console.log(`  ${C.dim}Logs:`)
  console.log(`    docker logs -f ${APP_CONTAINER}`)
  console.log(`  Stop:`)
  console.log(`    ${stopCmd}${C.reset}`)
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
