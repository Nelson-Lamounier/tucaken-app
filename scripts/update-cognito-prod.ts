/**
 * Tucaken — Cognito Production URL Update
 *
 * Adds your production domain to the Cognito App Client's allowed callback
 * and logout URLs so the OAuth flow works after deployment.
 * Existing URLs (localhost, staging) are preserved.
 *
 * Usage:
 *   just update-cognito-prod
 *   npx tsx scripts/update-cognito-prod.ts
 *   npx tsx scripts/update-cognito-prod.ts --region eu-west-1 --pool-id eu-west-1_mNRJM2InT
 */

import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  ListUserPoolClientsCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
  type UserPoolClientType,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromIni } from '@aws-sdk/credential-providers'
import { createInterface } from 'readline'

// ─── Config ───────────────────────────────────────────────────────────────────

const AWS_PROFILE = 'dev-account'

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  teal:   '\x1b[36m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  gray:   '\x1b[90m',
}

const ok   = (msg: string) => console.log(`  ${c.green}✓${c.reset}  ${msg}`)
const info = (msg: string) => console.log(`  ${c.teal}→${c.reset}  ${msg}`)
const warn = (msg: string) => console.log(`  ${c.yellow}⚠${c.reset}  ${msg}`)
const step = (label: string, detail: string) =>
  console.log(`\n  ${c.bold}${label.padEnd(16)}${c.reset}${c.gray}─── ${c.reset}${detail}`)
const rule  = () => console.log(`\n  ${c.dim}${'─'.repeat(54)}${c.reset}`)
const banner = (title: string) => {
  console.log(`\n  ${c.bold}${c.teal}❯ ${title}${c.reset}`)
  rule()
}

// ─── CLI / Interactive helpers ─────────────────────────────────────────────────

const args   = process.argv.slice(2)
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined }

const rl = createInterface({ input: process.stdin, output: process.stdout })

const prompt = (question: string, defaultValue?: string): Promise<string> =>
  new Promise((resolve) => {
    const suffix = defaultValue ? ` ${c.dim}[${defaultValue}]${c.reset}` : ''
    rl.question(`  ${c.bold}?${c.reset}  ${question}${suffix}: `, (ans) => resolve(ans.trim() || defaultValue || ''))
  })

// ─── AWS ──────────────────────────────────────────────────────────────────────

function makeCognito(region: string) {
  return new CognitoIdentityProviderClient({
    region,
    credentials: fromIni({ profile: AWS_PROFILE }),
  })
}

async function findPoolId(cognito: CognitoIdentityProviderClient, explicit?: string): Promise<string> {
  if (explicit) return explicit

  const pools: { Id: string; Name: string }[] = []
  let token: string | undefined
  do {
    const res = await cognito.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: token }))
    for (const p of res.UserPools ?? []) pools.push({ Id: p.Id!, Name: p.Name! })
    token = res.NextToken
  } while (token)

  if (pools.length === 0) throw new Error('No Cognito User Pools found.')
  if (pools.length === 1) { ok(`User Pool: ${pools[0].Name}  (${pools[0].Id})`); return pools[0].Id }

  console.log('\n  Multiple User Pools found:')
  pools.forEach((p, i) => console.log(`    ${c.bold}${i + 1}${c.reset}. ${p.Name}  (${p.Id})`))
  const choice = await prompt('Select pool number', '1')
  const picked = pools[parseInt(choice, 10) - 1]
  if (!picked) throw new Error('Invalid selection.')
  ok(`User Pool: ${picked.Name}  (${picked.Id})`)
  return picked.Id
}

async function findAppClient(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  explicitClientId?: string,
): Promise<UserPoolClientType> {
  const clientId = explicitClientId ?? await (async () => {
    const res = await cognito.send(new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60 }))
    const clients = res.UserPoolClients ?? []
    if (clients.length === 0) throw new Error('No App Clients found.')
    if (clients.length === 1) return clients[0].ClientId!

    console.log('\n  Multiple App Clients found:')
    clients.forEach((cl, i) => console.log(`    ${c.bold}${i + 1}${c.reset}. ${cl.ClientName}  (${cl.ClientId})`))
    const choice = await prompt('Select client number', '1')
    return clients[parseInt(choice, 10) - 1].ClientId!
  })()

  const detail = await cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId }),
  )
  return detail.UserPoolClient!
}

// ─── URL helpers ───────────────────────────────────────────────────────────────

function normalise(url: string): string {
  return url.replace(/\/+$/, '').toLowerCase()
}

function callbackUrl(base: string) { return `${base}/admin/auth/callback` }
function logoutUrl(base: string)   { return `${base}/admin/login` }

function mergeUrls(existing: string[], toAdd: string[]): { next: string[]; added: string[] } {
  const normExisting = existing.map(normalise)
  const added: string[] = []
  const next = [...existing]
  for (const u of toAdd) {
    if (!normExisting.includes(normalise(u))) {
      next.push(u)
      added.push(u)
    }
  }
  return { next, added }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
  ${c.bold}${c.teal}╔══════════════════════════════════════════════════╗${c.reset}
  ${c.bold}${c.teal}║   Tucaken — Cognito Production URL Update        ║${c.reset}
  ${c.bold}${c.teal}║   AWS Profile: ${AWS_PROFILE.padEnd(33)}║${c.reset}
  ${c.bold}${c.teal}╚══════════════════════════════════════════════════╝${c.reset}`)

  // ── Region ───────────────────────────────────────────────────────────────────
  let region = getArg('--region') ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION
  if (!region) region = await prompt('AWS Region', 'eu-west-1')

  const cognito = makeCognito(region)

  // ── Discover resources ────────────────────────────────────────────────────────
  step('Discovering', 'Cognito User Pool')
  const poolId = await findPoolId(cognito, getArg('--pool-id'))

  step('Discovering', 'App Client')
  const client = await findAppClient(cognito, poolId, getArg('--client-id'))
  ok(`App Client: ${client.ClientName}  (${client.ClientId})`)

  // ── Show current state ────────────────────────────────────────────────────────
  banner('Current Callback URLs')

  const existingCallbacks = client.CallbackURLs ?? []
  const existingLogouts   = client.LogoutURLs   ?? []

  if (existingCallbacks.length === 0) {
    warn('No callback URLs configured yet.')
  } else {
    existingCallbacks.forEach((u) => info(u))
  }

  console.log()
  console.log(`  ${c.bold}Logout URLs:${c.reset}`)
  if (existingLogouts.length === 0) {
    warn('No logout URLs configured yet.')
  } else {
    existingLogouts.forEach((u) => info(u))
  }

  // ── Ask for production URL ────────────────────────────────────────────────────
  banner('Production URL')

  console.log(`
  This adds your production domain to the Cognito App Client allowlist.
  Existing URLs (localhost etc.) are preserved — not replaced.

  Enter your production base URL without a trailing slash.
  Examples:  https://tucaken.com   or   https://admin.tucaken.com
`)

  const rawProdUrl = await prompt('Production URL')
  if (!rawProdUrl) throw new Error('Production URL is required.')
  if (!rawProdUrl.startsWith('https://')) {
    throw new Error('Production URL must start with https://')
  }

  const prodBase = normalise(rawProdUrl)
  const newCallback = callbackUrl(prodBase)
  const newLogout   = logoutUrl(prodBase)

  // ── Compute diff ──────────────────────────────────────────────────────────────
  const { next: nextCallbacks, added: addedCallbacks } = mergeUrls(existingCallbacks, [newCallback])
  const { next: nextLogouts,   added: addedLogouts   } = mergeUrls(existingLogouts,   [newLogout])

  banner('Changes')

  if (addedCallbacks.length === 0 && addedLogouts.length === 0) {
    warn('Both URLs already exist in the App Client — nothing to update.')
    rl.close()
    return
  }

  if (addedCallbacks.length > 0) {
    console.log(`  ${c.green}+ Callback URL${c.reset}`)
    addedCallbacks.forEach((u) => console.log(`      ${u}`))
  }
  if (addedLogouts.length > 0) {
    console.log(`  ${c.green}+ Logout URL${c.reset}`)
    addedLogouts.forEach((u) => console.log(`      ${u}`))
  }

  console.log()
  const confirm = await prompt('Apply these changes? (y/n)', 'y')
  if (confirm.toLowerCase() !== 'y') {
    warn('Aborted — no changes made.')
    rl.close()
    return
  }

  // ── Apply update ──────────────────────────────────────────────────────────────
  step('Updating', 'Cognito App Client')

  await cognito.send(
    new UpdateUserPoolClientCommand({
      UserPoolId:  poolId,
      ClientId:    client.ClientId!,
      ClientName:  client.ClientName,

      CallbackURLs: nextCallbacks,
      LogoutURLs:   nextLogouts,

      // Preserve all existing settings exactly
      SupportedIdentityProviders:       client.SupportedIdentityProviders,
      AllowedOAuthFlows:                client.AllowedOAuthFlows,
      AllowedOAuthScopes:               client.AllowedOAuthScopes,
      AllowedOAuthFlowsUserPoolClient:  client.AllowedOAuthFlowsUserPoolClient,
      ExplicitAuthFlows:                client.ExplicitAuthFlows,
      RefreshTokenValidity:             client.RefreshTokenValidity,
      AccessTokenValidity:              client.AccessTokenValidity,
      IdTokenValidity:                  client.IdTokenValidity,
      TokenValidityUnits:               client.TokenValidityUnits,
      ReadAttributes:                   client.ReadAttributes,
      WriteAttributes:                  client.WriteAttributes,
      PreventUserExistenceErrors:       client.PreventUserExistenceErrors,
      EnableTokenRevocation:            client.EnableTokenRevocation,
    }),
  )

  ok('App Client updated')

  // ── Summary ───────────────────────────────────────────────────────────────────
  console.log(`
  ${c.bold}${c.green}╔══════════════════════════════════════════════════╗${c.reset}
  ${c.bold}${c.green}║  Done ✓  Production URLs added.                  ║${c.reset}
  ${c.bold}${c.green}╚══════════════════════════════════════════════════╝${c.reset}

  ${c.bold}Callback URL added:${c.reset}
    ${newCallback}

  ${c.bold}Logout URL added:${c.reset}
    ${newLogout}

  ${c.dim}${'─'.repeat(54)}${c.reset}

  ${c.bold}${c.yellow}Next steps — set this in your production environment:${c.reset}

    ${c.bold}VITE_APP_URL${c.reset}=${prodBase}

  Your deployment platform (ECS task definition, SSM Parameter
  Store, Kubernetes secret, etc.) must have this var set so the
  server builds the correct redirect URI during the OAuth flow.

  ${c.dim}${'─'.repeat(54)}${c.reset}

  ${c.bold}Full callback URL list now in Cognito:${c.reset}`)
  nextCallbacks.forEach((u) => info(u))

  console.log()
  console.log(`  ${c.bold}Full logout URL list now in Cognito:${c.reset}`)
  nextLogouts.forEach((u) => info(u))
  console.log()
}

main().catch((err) => {
  console.error(`\n  ${c.red}✗  Error:${c.reset}  ${err.message}\n`)
  if (process.env.DEBUG) console.error(err.stack)
  rl.close()
  process.exit(1)
})
