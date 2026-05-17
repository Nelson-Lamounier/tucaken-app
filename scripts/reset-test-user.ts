/**
 * Interactive cleanup: list users from RDS + Cognito, pick one, wipe from both.
 *
 * RDS cleanup runs via `kubectl exec` into the pgbouncer pod — requires the
 * cluster port-forward to be active (just local-cluster). The same channel is
 * used to LIST users; if kubectl is unavailable the script falls back to
 * Cognito-only listing.
 *
 * Usage:
 *   just reset-test-user                       # interactive picker
 *   npx tsx scripts/reset-test-user.ts
 *   npx tsx scripts/reset-test-user.ts --email=foo@bar.com   # non-interactive
 *   npx tsx scripts/reset-test-user.ts --yes                 # skip confirm
 */

import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromIni } from '@aws-sdk/credential-providers'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

// ── Config ────────────────────────────────────────────────────────────────────

const AWS_PROFILE    = 'dev-account'
const K8S_NAMESPACE  = 'platform'
const K8S_DEPLOYMENT = 'pgbouncer'

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local')

function resolvePoolId(): string {
  const issuerUrl = readEnvLocal('AUTH_COGNITO_ISSUER_URL')
  const match = issuerUrl?.match(/amazonaws\.com\/([\w-]+)$/)
  if (!match?.[1]) throw new Error('Cannot derive pool ID from AUTH_COGNITO_ISSUER_URL in .env.local')
  return match[1]
}

function resolveRegion(): string {
  const issuerUrl = readEnvLocal('AUTH_COGNITO_ISSUER_URL')
  const match = issuerUrl?.match(/cognito-idp\.([\w-]+)\.amazonaws/)
  if (!match?.[1]) throw new Error('Cannot derive region from AUTH_COGNITO_ISSUER_URL in .env.local')
  return match[1]
}

function readEnvLocal(key: string): string | undefined {
  if (!existsSync(ENV_LOCAL)) return undefined
  const content = readFileSync(ENV_LOCAL, 'utf-8')
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return match?.[1]?.trim()
}

// ── CLI args ──────────────────────────────────────────────────────────────────

function parseArgs() {
  const argv = process.argv.slice(2)
  let email: string | undefined
  let skipConfirm = false
  for (const a of argv) {
    if (a.startsWith('--email=')) email = a.slice('--email='.length).trim()
    else if (a === '--yes' || a === '-y') skipConfirm = true
  }
  return { email, skipConfirm }
}

// ── Colours ───────────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  teal:   '\x1b[36m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
  red:    '\x1b[31m',
}

const ok   = (msg: string) => console.log(`  ${c.green}✓${c.reset}  ${msg}`)
const warn = (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`)
const info = (msg: string) => console.log(`  ${c.teal}→${c.reset}  ${msg}`)
const dim  = (msg: string) => console.log(`  ${c.gray}${msg}${c.reset}`)
const fail = (msg: string) => console.log(`  ${c.red}✗${c.reset}  ${msg}`)

// ── RDS helpers ───────────────────────────────────────────────────────────────

function kubectlPsql(sql: string): { ok: boolean; stdout: string; stderr: string } {
  const result = spawnSync(
    'kubectl',
    [
      'exec', '-i',
      '-n', K8S_NAMESPACE,
      `deployment/${K8S_DEPLOYMENT}`,
      '--',
      'sh', '-c',
      'psql "host=$POSTGRESQL_HOST dbname=$POSTGRESQL_DATABASE user=$POSTGRESQL_USERNAME password=$POSTGRESQL_PASSWORD" -v ON_ERROR_STOP=1 -A -t -F "\t"',
    ],
    { input: sql, encoding: 'utf-8' },
  )
  return {
    ok:     result.status === 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

type RdsUser = {
  id:        string
  email:     string
  fullName:  string | null
  role:      string
  createdAt: string
}

function listRdsUsers(): { ok: boolean; users: RdsUser[]; err?: string } {
  const sql = `SELECT id, email, COALESCE(full_name, ''), role, created_at::text
               FROM users
               ORDER BY created_at DESC
               LIMIT 100;`
  const r = kubectlPsql(sql)
  if (!r.ok) return { ok: false, users: [], err: r.stderr.trim() || 'kubectl exec failed' }
  const users: RdsUser[] = []
  for (const line of r.stdout.split('\n')) {
    if (!line.trim()) continue
    const [id, email, fullName, role, createdAt] = line.split('\t')
    if (!id || !email) continue
    users.push({ id, email, fullName: fullName || null, role: role ?? 'user', createdAt: createdAt ?? '' })
  }
  return { ok: true, users }
}

function buildPurgeSql(email: string): string {
  const e = `'${email.replace(/'/g, "''")}'`
  return [
    `DELETE FROM plan_events         WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM usage_quotas        WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM trial_nudges        WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM resume_imports      WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM user_career_history WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM resumes             WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM articles            WHERE author_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM job_applications    WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM pipeline_runs       WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM user_identities     WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM users               WHERE email = ${e};`,
  ].join('\n')
}

function purgeRds(email: string): { ok: boolean; err?: string } {
  const r = kubectlPsql(buildPurgeSql(email))
  return { ok: r.ok, err: r.ok ? undefined : r.stderr.trim() }
}

// ── Cognito helpers ───────────────────────────────────────────────────────────

type CognitoUser = { email: string; username: string; status: string; created: string }

async function listCognitoUsers(
  client: CognitoIdentityProviderClient,
  poolId: string,
): Promise<CognitoUser[]> {
  const users: CognitoUser[] = []
  let token: string | undefined
  do {
    const res = await client.send(new ListUsersCommand({
      UserPoolId:      poolId,
      Limit:           60,
      PaginationToken: token,
    }))
    for (const u of res.Users ?? []) users.push(toCognitoUser(u))
    token = res.PaginationToken
  } while (token)
  return users
}

function toCognitoUser(u: UserType): CognitoUser {
  const email =
    u.Attributes?.find((a) => a.Name === 'email')?.Value ?? u.Username ?? ''
  return {
    email,
    username: u.Username ?? '',
    status:   u.UserStatus ?? '',
    created:  u.UserCreateDate?.toISOString() ?? '',
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

type Entry = {
  email:    string
  inRds:    boolean
  inCog:    boolean
  rds?:     RdsUser
  cog?:     CognitoUser
}

function mergeUsers(rds: RdsUser[], cog: CognitoUser[]): Entry[] {
  const byEmail = new Map<string, Entry>()
  for (const r of rds) {
    byEmail.set(r.email.toLowerCase(), { email: r.email, inRds: true, inCog: false, rds: r })
  }
  for (const u of cog) {
    const key = u.email.toLowerCase()
    const existing = byEmail.get(key)
    if (existing) {
      existing.inCog = true
      existing.cog   = u
    } else {
      byEmail.set(key, { email: u.email, inRds: false, inCog: true, cog: u })
    }
  }
  return [...byEmail.values()].sort((a, b) => {
    const da = a.rds?.createdAt ?? a.cog?.created ?? ''
    const db = b.rds?.createdAt ?? b.cog?.created ?? ''
    return db.localeCompare(da)
  })
}

function sourceTag(e: Entry): string {
  if (e.inRds && e.inCog) return `${c.green}RDS+Cog${c.reset}`
  if (e.inRds)            return `${c.yellow}RDS only${c.reset}`
  return `${c.yellow}Cog only${c.reset}`
}

function renderTable(entries: Entry[]) {
  console.log(`  ${c.bold}#   Source     Email                                    Role     Created${c.reset}`)
  console.log(`  ${c.gray}${'─'.repeat(86)}${c.reset}`)
  entries.forEach((e, i) => {
    const idx     = String(i + 1).padStart(3)
    const tag     = sourceTag(e).padEnd(10 + (sourceTag(e).length - 'RDS+Cog'.length)) // colour codes don't count
    const email   = (e.email || '(no email)').padEnd(40).slice(0, 40)
    const role    = (e.rds?.role ?? '—').padEnd(8)
    const created = (e.rds?.createdAt ?? e.cog?.created ?? '').slice(0, 19)
    console.log(`  ${idx}  ${tag} ${email} ${role} ${c.gray}${created}${c.reset}`)
  })
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}tucaken — Reset Test User${c.reset}\n`)

  const { email: cliEmail, skipConfirm } = parseArgs()
  const region = resolveRegion()
  const poolId = resolvePoolId()

  info(`Pool:    ${poolId}`)
  info(`Region:  ${region}`)
  console.log()

  const cognito = new CognitoIdentityProviderClient({
    region,
    credentials: fromIni({ profile: AWS_PROFILE }),
  })

  let targetEmail: string

  if (cliEmail) {
    targetEmail = cliEmail
    info(`Email (from --email): ${targetEmail}`)
  } else {
    info('Loading users from RDS and Cognito…')
    const [rdsResult, cogUsers] = await Promise.all([
      Promise.resolve(listRdsUsers()),
      listCognitoUsers(cognito, poolId).catch((err: Error) => {
        warn(`Cognito list failed: ${err.message}`)
        return [] as CognitoUser[]
      }),
    ])

    if (!rdsResult.ok) warn(`RDS list failed (${rdsResult.err}) — showing Cognito only`)

    const entries = mergeUsers(rdsResult.users, cogUsers)
    if (entries.length === 0) {
      fail('No users found in RDS or Cognito.')
      process.exit(1)
    }

    console.log()
    renderTable(entries)
    console.log()

    const rl = createInterface({ input: stdin, output: stdout })
    const answer = (await rl.question(`  Select user # to delete (or 'q' to quit): `)).trim()
    rl.close()

    if (!answer || answer.toLowerCase() === 'q') {
      info('Cancelled.')
      process.exit(0)
    }

    const idx = Number.parseInt(answer, 10) - 1
    if (Number.isNaN(idx) || idx < 0 || idx >= entries.length) {
      fail(`Invalid selection: ${answer}`)
      process.exit(1)
    }
    targetEmail = entries[idx]!.email
  }

  // ── Confirm ───────────────────────────────────────────────────────────────
  if (!skipConfirm) {
    console.log()
    const rl = createInterface({ input: stdin, output: stdout })
    const yn = (await rl.question(`  ${c.red}Delete ${targetEmail} from Cognito + RDS?${c.reset} [y/N] `)).trim().toLowerCase()
    rl.close()
    if (yn !== 'y' && yn !== 'yes') {
      info('Cancelled.')
      process.exit(0)
    }
  }

  console.log()

  // ── Delete from Cognito ───────────────────────────────────────────────────
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: targetEmail }))
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: targetEmail }))
    ok(`Cognito: deleted ${targetEmail}`)
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      ok(`Cognito: ${targetEmail} not found (already deleted)`)
    } else {
      throw err
    }
  }

  // ── Delete from RDS ───────────────────────────────────────────────────────
  const r = purgeRds(targetEmail)
  if (r.ok) {
    ok(`RDS: purged rows for ${targetEmail}`)
  } else {
    warn(`RDS: kubectl exec failed (${r.err ?? 'unknown'}) — is the cluster port-forward active? (just local-cluster)`)
    warn('Run this SQL manually when the cluster is up:')
    console.log()
    buildPurgeSql(targetEmail).split('\n').forEach((line) => dim(`  ${line}`))
    console.log()
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log()
  console.log(`${c.bold}Ready for next test run${c.reset}`)
  console.log(`  1. Open the app in an incognito window (or clear cookies)`)
  console.log(`  2. Sign up with ${targetEmail} + a strong password (≥12 chars, upper/lower/number/symbol)`)
  console.log(`  3. Enter the 6-digit code sent to that email`)
  console.log(`  4. You'll land on /onboarding as a brand-new user`)
  console.log()
}

main().catch((err) => {
  console.error('\n  ✗  Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
