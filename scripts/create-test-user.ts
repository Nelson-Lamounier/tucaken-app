/**
 * Creates (or verifies) a stable test user in the dev Cognito pool.
 *
 * The user is NOT added to the 'admin' Cognito group, so they land in RDS
 * with role='user', get a 14-day trial, and hit the full new-user flow.
 *
 * Run once:
 *   just create-test-user
 *   npx tsx scripts/create-test-user.ts
 *
 * After running, sign in at /sign-in with:
 *   email:    (printed by this script — VITE_TEST_USER_EMAIL in .env.local)
 *   password: (printed by this script — store in 1Password / local notes)
 */

import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  MessageActionType,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromIni } from '@aws-sdk/credential-providers'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// ── Config ────────────────────────────────────────────────────────────────────

const AWS_PROFILE = 'dev-account'
const REPO_ROOT = resolve(fileURLToPath(import.meta.url), '../..')
const ENV_LOCAL = resolve(REPO_ROOT, '.env.local')

function resolvePoolId(): string {
  const issuerUrl = process.env['AUTH_COGNITO_ISSUER_URL'] ?? readEnvLocal('AUTH_COGNITO_ISSUER_URL')
  const match = issuerUrl?.match(/amazonaws\.com\/([\w-]+)$/)
  if (!match?.[1]) throw new Error('Cannot derive pool ID from AUTH_COGNITO_ISSUER_URL')
  return match[1]
}

function resolveRegion(): string {
  const issuerUrl = process.env['AUTH_COGNITO_ISSUER_URL'] ?? readEnvLocal('AUTH_COGNITO_ISSUER_URL')
  const match = issuerUrl?.match(/cognito-idp\.([\w-]+)\.amazonaws/)
  if (!match?.[1]) throw new Error('Cannot derive region from AUTH_COGNITO_ISSUER_URL')
  return match[1]
}

function readEnvLocal(key: string): string | undefined {
  if (!existsSync(ENV_LOCAL)) return undefined
  const content = readFileSync(ENV_LOCAL, 'utf-8')
  const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return match?.[1]?.trim()
}

function writeEnvLocalKey(key: string, value: string): void {
  let content = existsSync(ENV_LOCAL) ? readFileSync(ENV_LOCAL, 'utf-8') : ''
  const pattern = new RegExp(`^${key}=.*$`, 'm')
  const line = `${key}=${value}`
  if (pattern.test(content)) {
    content = content.replace(pattern, line)
  } else {
    content += `\n${line}\n`
  }
  writeFileSync(ENV_LOCAL, content, 'utf-8')
}

// ── Colours ───────────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  teal:   '\x1b[36m',
  yellow: '\x1b[33m',
  gray:   '\x1b[90m',
}

const ok   = (msg: string) => console.log(`  ${c.green}✓${c.reset}  ${msg}`)
const info = (msg: string) => console.log(`  ${c.teal}→${c.reset}  ${msg}`)
const warn = (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`)
const dim  = (msg: string) => console.log(`  ${c.gray}${msg}${c.reset}`)

// ── Password generation ───────────────────────────────────────────────────────

function generatePassword(): string {
  // Cognito default policy: ≥8 chars, upper, lower, digit, symbol
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%'
  let pw = 'Tuck3n!'
  for (let i = 0; i < 9; i++) {
    pw += chars[Math.floor(Math.random() * chars.length)]
  }
  return pw
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n${c.bold}tucaken — Create Test User${c.reset}\n`)

  const region   = resolveRegion()
  const poolId   = resolvePoolId()
  const email    = `test+dev@nelsonlamounier.com`

  info(`Pool:   ${poolId}`)
  info(`Region: ${region}`)
  info(`Email:  ${email}`)
  console.log()

  const client = new CognitoIdentityProviderClient({
    region,
    credentials: fromIni({ profile: AWS_PROFILE }),
  })

  // ── Check if user already exists ─────────────────────────────────────────
  let userExists = false
  try {
    await client.send(new AdminGetUserCommand({ UserPoolId: poolId, Username: email }))
    userExists = true
    ok('Test user already exists in Cognito')
  } catch (err: unknown) {
    if ((err as { name?: string }).name === 'UserNotFoundException') {
      userExists = false
    } else {
      throw err
    }
  }

  let password: string

  if (!userExists) {
    // ── Create the user ─────────────────────────────────────────────────────
    password = generatePassword()

    await client.send(new AdminCreateUserCommand({
      UserPoolId:        poolId,
      Username:          email,
      TemporaryPassword: password,
      MessageAction:     MessageActionType.SUPPRESS,    // no welcome email
      UserAttributes: [
        { Name: 'email',          Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'name',           Value: 'Test User' },
      ],
    }))

    // ── Promote to CONFIRMED with a permanent password ───────────────────────
    // Without this, Cognito forces a password change on first sign-in.
    await client.send(new AdminSetUserPasswordCommand({
      UserPoolId: poolId,
      Username:   email,
      Password:   password,
      Permanent:  true,
    }))

    ok(`Created test user: ${email}`)
    ok(`Set permanent password`)

    // Save password to .env.local (gitignored) for convenience
    writeEnvLocalKey('VITE_TEST_USER_EMAIL', email)
    writeEnvLocalKey('VITE_TEST_USER_PASSWORD', password)
    ok(`Saved credentials to .env.local`)
  } else {
    // User exists — read saved password from .env.local if available
    password = readEnvLocal('VITE_TEST_USER_PASSWORD') ?? '(check .env.local)'
    warn(`User exists. Password unchanged.`)
    dim(`If you forgot the password, run: just reset-test-user`)
  }

  console.log()
  console.log(`${c.bold}${c.teal}Test user credentials${c.reset}`)
  console.log(`  Email:    ${email}`)
  console.log(`  Password: ${password}`)
  console.log()
  console.log(`${c.bold}Next steps${c.reset}`)
  console.log(`  1. Uncomment VITE_DEV_FORCE_ONBOARDING=true in .env.local`)
  console.log(`  2. yarn dev`)
  console.log(`  3. Visit http://localhost:5001 → you'll be redirected to /onboarding`)
  console.log(`  4. Sign in with the credentials above via the Cognito hosted UI`)
  console.log()
  console.log(`  To reset (wipe state, re-test onboarding from scratch):`)
  console.log(`  ${c.teal}just reset-test-user${c.reset}`)
  console.log()
}

main().catch((err) => {
  console.error('\n  ✗  Failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
