/**
 * Adds ALLOW_USER_PASSWORD_AUTH to the Cognito App Client ExplicitAuthFlows.
 * Existing flows are preserved. Safe to run multiple times.
 *
 * Usage:
 *   just enable-password-auth
 *   npx tsx scripts/enable-password-auth.ts
 */

import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  ListUserPoolClientsCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromIni } from '@aws-sdk/credential-providers'

const AWS_PROFILE = 'dev-account'
const REQUIRED_FLOW = 'ALLOW_USER_PASSWORD_AUTH'

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  green:  '\x1b[32m',
  teal:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
}

const ok   = (msg: string) => console.log(`  ${c.green}✓${c.reset}  ${msg}`)
const info = (msg: string) => console.log(`  ${c.teal}→${c.reset}  ${msg}`)
const warn = (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`)

// ─── resolve region ────────────────────────────────────────────────────────────

function regionFromEnv(): string {
  const issuer = process.env.AUTH_COGNITO_ISSUER
  if (issuer) {
    const m = issuer.match(/cognito-idp\.([a-z0-9-]+)\.amazonaws\.com/)
    if (m) return m[1]
  }
  const domain = process.env.AUTH_COGNITO_DOMAIN
  if (domain) {
    const m = domain.match(/\.auth\.([a-z0-9-]+)\.amazoncognito\.com/)
    if (m) return m[1]
  }
  return 'eu-west-1'
}

// ─── discover pool + client ───────────────────────────────────────────────────

async function findSinglePool(cognito: CognitoIdentityProviderClient): Promise<{ Id: string; Name: string }> {
  const pools: { Id: string; Name: string }[] = []
  let token: string | undefined
  do {
    const res = await cognito.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: token }))
    for (const p of res.UserPools ?? []) pools.push({ Id: p.Id!, Name: p.Name! })
    token = res.NextToken
  } while (token)

  if (pools.length === 0) throw new Error('No Cognito User Pools found.')
  if (pools.length === 1) return pools[0]

  // prefer env var
  const envPool = process.env.AUTH_COGNITO_ISSUER?.split('/').pop()
  const match = envPool ? pools.find((p) => p.Id === envPool) : undefined
  if (match) return match

  console.log('\n  Multiple pools — select one:')
  pools.forEach((p, i) => console.log(`    ${c.bold}${i + 1}${c.reset}. ${p.Name}  (${p.Id})`))
  const { createInterface } = await import('readline')
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const choice = await new Promise<string>((resolve) => rl.question('  Pool number: ', (a) => { rl.close(); resolve(a) }))
  const picked = pools[parseInt(choice, 10) - 1]
  if (!picked) throw new Error('Invalid selection.')
  return picked
}

// ─── main ─────────────────────────────────────────────────────────────────────

async function main() {
  const region = regionFromEnv()
  const cognito = new CognitoIdentityProviderClient({
    region,
    credentials: fromIni({ profile: AWS_PROFILE }),
  })

  console.log(`\n  ${c.bold}${c.teal}Enabling USER_PASSWORD_AUTH${c.reset}  (profile: ${AWS_PROFILE}, region: ${region})\n`)

  const pool = await findSinglePool(cognito)
  ok(`Pool: ${pool.Name}  (${pool.Id})`)

  const clientsRes = await cognito.send(new ListUserPoolClientsCommand({ UserPoolId: pool.Id, MaxResults: 60 }))
  const clients = clientsRes.UserPoolClients ?? []
  if (clients.length === 0) throw new Error('No App Clients found.')

  // Try to match client ID from env
  const envClientId = process.env.AUTH_COGNITO_ID || process.env.AUTH_COGNITO_CLIENT_ID
  const target = (envClientId ? clients.find((c) => c.ClientId === envClientId) : undefined) ?? clients[0]

  const detail = await cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: pool.Id, ClientId: target.ClientId! }),
  )
  const client = detail.UserPoolClient!
  ok(`Client: ${client.ClientName}  (${client.ClientId})`)

  const existing = client.ExplicitAuthFlows ?? []
  info(`Current auth flows: ${existing.join(', ') || '(none)'}`)

  if (existing.includes(REQUIRED_FLOW)) {
    warn(`${REQUIRED_FLOW} already enabled — nothing to do.`)
    return
  }

  const updated = [...existing, REQUIRED_FLOW]

  await cognito.send(
    new UpdateUserPoolClientCommand({
      UserPoolId:  pool.Id,
      ClientId:    client.ClientId!,
      ClientName:  client.ClientName,
      ExplicitAuthFlows: updated,

      // Preserve all other settings
      SupportedIdentityProviders:      client.SupportedIdentityProviders,
      CallbackURLs:                    client.CallbackURLs,
      LogoutURLs:                      client.LogoutURLs,
      AllowedOAuthFlows:               client.AllowedOAuthFlows,
      AllowedOAuthScopes:              client.AllowedOAuthScopes,
      AllowedOAuthFlowsUserPoolClient: client.AllowedOAuthFlowsUserPoolClient,
      RefreshTokenValidity:            client.RefreshTokenValidity,
      AccessTokenValidity:             client.AccessTokenValidity,
      IdTokenValidity:                 client.IdTokenValidity,
      TokenValidityUnits:              client.TokenValidityUnits,
      ReadAttributes:                  client.ReadAttributes,
      WriteAttributes:                 client.WriteAttributes,
      PreventUserExistenceErrors:      client.PreventUserExistenceErrors,
      EnableTokenRevocation:           client.EnableTokenRevocation,
    }),
  )

  ok(`${REQUIRED_FLOW} added`)
  info(`Auth flows now: ${updated.join(', ')}`)

  console.log(`\n  ${c.bold}${c.green}Done.${c.reset} Email/password sign-in is now enabled.\n`)
}

main().catch((err) => {
  console.error(`\n  ${c.red}✗${c.reset}  ${err.message}\n`)
  process.exit(1)
})
