/**
 * Wipes the test user (VITE_TEST_USER_EMAIL) from Cognito and RDS so the
 * sign-up flow can be tested end-to-end via the UI.
 *
 * RDS cleanup runs via `kubectl exec` into the admin-api pod — requires the
 * cluster port-forward to be active (just local-cluster). If kubectl is
 * unavailable the script prints the SQL and continues.
 *
 * Usage:
 *   just reset-test-user
 *   npx tsx scripts/reset-test-user.ts
 */

import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand,
  AdminGetUserCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromIni } from '@aws-sdk/credential-providers'
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Config ────────────────────────────────────────────────────────────────────

const AWS_PROFILE    = 'dev-account'
const K8S_NAMESPACE  = 'admin-api'
const K8S_DEPLOYMENT = 'admin-api'

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

// ── RDS helpers ───────────────────────────────────────────────────────────────

function buildPurgeSql(email: string): string {
  const e = `'${email}'`
  return [
    `DELETE FROM plan_events         WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM usage_quotas        WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM trial_nudges        WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM resume_imports      WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM user_career_history WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM resumes             WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM articles            WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM job_applications    WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM pipeline_runs       WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM user_identities     WHERE user_id IN (SELECT id FROM users WHERE email = ${e});`,
    `DELETE FROM users               WHERE email = ${e};`,
  ].join('\n')
}

function purgeRds(email: string): boolean {
  const sql = buildPurgeSql(email)

  // spawnSync with no shell — SQL piped via stdin, never interpolated into argv
  const result = spawnSync(
    'kubectl',
    [
      'exec', '-i',
      '-n', K8S_NAMESPACE,
      `deployment/${K8S_DEPLOYMENT}`,
      '--',
      'sh', '-c',
      'psql "host=$PG_HOST dbname=$PG_DATABASE user=$PG_USER password=$PG_PASSWORD" -v ON_ERROR_STOP=1',
    ],
    { input: sql, encoding: 'utf-8' },
  )

  return result.status === 0
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}tucaken — Reset Test User${c.reset}\n`)

  const region = resolveRegion()
  const poolId = resolvePoolId()
  const email  = readEnvLocal('VITE_TEST_USER_EMAIL')

  if (!email) {
    console.error(`  ${c.red}✗${c.reset}  VITE_TEST_USER_EMAIL not set in .env.local`)
    process.exit(1)
  }

  info(`Pool:  ${poolId}`)
  info(`Email: ${email}`)
  console.log()

  const cognito = new CognitoIdentityProviderClient({
    region,
    credentials: fromIni({ profile: AWS_PROFILE }),
  })

  // ── Delete from Cognito ───────────────────────────────────────────────────
  try {
    await cognito.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: email }))
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: poolId, Username: email }))
    ok(`Cognito: deleted ${email}`)
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      ok(`Cognito: ${email} not found (already deleted)`)
    } else {
      throw err
    }
  }

  // ── Delete from RDS ───────────────────────────────────────────────────────
  console.log()
  const succeeded = purgeRds(email)

  if (succeeded) {
    ok(`RDS: purged rows for ${email}`)
  } else {
    warn('RDS: kubectl exec failed — is the cluster port-forward active? (just local-cluster)')
    warn('Run this SQL manually when the cluster is up:')
    console.log()
    buildPurgeSql(email).split('\n').forEach((line) => dim(`  ${line}`))
    console.log()
  }

  // ── Done ──────────────────────────────────────────────────────────────────
  console.log()
  console.log(`${c.bold}Ready to test sign-up end-to-end${c.reset}`)
  console.log(`  1. Open the app in an incognito window (or clear cookies)`)
  console.log(`  2. Sign up with ${email} + a strong password (≥12 chars, upper/lower/number/symbol)`)
  console.log(`  3. Enter the 6-digit code sent to that email`)
  console.log(`  4. You'll land on /onboarding as a brand-new user`)
  console.log()
}

main().catch((err) => {
  console.error('\n  ✗  Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
