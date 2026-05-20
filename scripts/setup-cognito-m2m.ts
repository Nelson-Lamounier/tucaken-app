/**
 * Tucaken — Cognito M2M (machine-to-machine) provisioning script.
 *
 * Provisions a resource server + confidential app client in the existing
 * Cognito User Pool so that the tucaken-app SSR pod can mint
 * client_credentials access tokens for admin-api `/api/internal/*` routes.
 *
 * Background: see docs/billing-integration.md ("Service-to-service auth").
 *
 * Idempotent: re-running detects existing resource server / app client and
 * patches them in place rather than creating duplicates.
 *
 * Usage:
 *   npx tsx scripts/setup-cognito-m2m.ts
 *   npx tsx scripts/setup-cognito-m2m.ts --pool-id eu-west-1_abc123 --region eu-west-1
 *
 * After running, the script prints:
 *   COGNITO_M2M_CLIENT_ID=...
 *   COGNITO_M2M_CLIENT_SECRET=...           ← shown ONCE; copy to secret store
 *   COGNITO_M2M_SCOPE=tucaken-internal/write:billing
 *   M2M_RESOURCE_SERVER_ID=tucaken-internal (for admin-api)
 *   M2M_REQUIRED_SCOPE=tucaken-internal/write:billing (for admin-api)
 *
 * Stripe-side: paste these into the appropriate K8s secret (tucaken-app pod)
 * and admin-api configmap, then redeploy.
 */

import {
  CognitoIdentityProviderClient,
  CreateResourceServerCommand,
  DescribeResourceServerCommand,
  UpdateResourceServerCommand,
  CreateUserPoolClientCommand,
  DescribeUserPoolClientCommand,
  UpdateUserPoolClientCommand,
  ListUserPoolClientsCommand,
  OAuthFlowType,
  ResourceNotFoundException,
} from '@aws-sdk/client-cognito-identity-provider'
import { fromIni } from '@aws-sdk/credential-providers'

// ─── Args ────────────────────────────────────────────────────────────────────

interface Args {
  region: string
  poolId: string
  profile: string
  identifier: string
  scopeName: string
  scopeDescription: string
  clientName: string
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const get = (flag: string, fallback: string): string => {
    const i = argv.indexOf(flag)
    return i >= 0 && argv[i + 1] ? argv[i + 1]! : fallback
  }
  return {
    region:           get('--region', process.env.AWS_REGION ?? 'eu-west-1'),
    poolId:           get('--pool-id', process.env.COGNITO_USER_POOL_ID ?? ''),
    profile:          get('--profile', process.env.AWS_PROFILE ?? 'default'),
    identifier:       get('--resource-id', 'tucaken-internal'),
    scopeName:        get('--scope-name', 'write:billing'),
    scopeDescription: get(
      '--scope-description',
      'Mutate Stripe billing state via /api/internal/billing/*',
    ),
    clientName:       get('--client-name', 'tucaken-app-service'),
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs()
  if (!args.poolId) {
    throw new Error(
      'COGNITO_USER_POOL_ID env or --pool-id flag is required.',
    )
  }

  const cognito = new CognitoIdentityProviderClient({
    region:      args.region,
    credentials: fromIni({ profile: args.profile }),
  })

  // ── 1. Resource server (create or patch) ───────────────────────────────────
  const fullScope = `${args.identifier}/${args.scopeName}`
  const scopeDef  = {
    ScopeName:        args.scopeName,
    ScopeDescription: args.scopeDescription,
  }

  let resourceExists = false
  try {
    await cognito.send(
      new DescribeResourceServerCommand({
        UserPoolId: args.poolId,
        Identifier: args.identifier,
      }),
    )
    resourceExists = true
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err
  }

  if (resourceExists) {
    await cognito.send(
      new UpdateResourceServerCommand({
        UserPoolId: args.poolId,
        Identifier: args.identifier,
        Name:       'Tucaken internal services',
        Scopes:     [scopeDef],
      }),
    )
    console.log(`✓ Updated resource server ${args.identifier}`)
  } else {
    await cognito.send(
      new CreateResourceServerCommand({
        UserPoolId: args.poolId,
        Identifier: args.identifier,
        Name:       'Tucaken internal services',
        Scopes:     [scopeDef],
      }),
    )
    console.log(`✓ Created resource server ${args.identifier}`)
  }

  // ── 2. App client (create or patch) ────────────────────────────────────────
  // Find an existing client by name. Cognito does not allow lookup by name
  // directly — we list and match locally. Pools rarely have >25 clients;
  // pagination is omitted for clarity.
  const list = await cognito.send(
    new ListUserPoolClientsCommand({
      UserPoolId: args.poolId,
      MaxResults: 60,
    }),
  )
  const existing = (list.UserPoolClients ?? []).find(
    (c) => c.ClientName === args.clientName,
  )

  let clientId: string
  let clientSecret: string | undefined

  const clientCommon = {
    UserPoolId:                      args.poolId,
    ClientName:                      args.clientName,
    AllowedOAuthFlows:               [OAuthFlowType.client_credentials],
    AllowedOAuthScopes:              [fullScope],
    AllowedOAuthFlowsUserPoolClient: true,
  }

  if (!existing) {
    const created = await cognito.send(
      new CreateUserPoolClientCommand({
        ...clientCommon,
        // GenerateSecret is create-only — turns this into a confidential client.
        GenerateSecret: true,
      }),
    )
    clientId     = created.UserPoolClient!.ClientId!
    clientSecret = created.UserPoolClient!.ClientSecret
    console.log(`✓ Created app client ${args.clientName} (${clientId})`)
  } else {
    clientId = existing.ClientId!
    await cognito.send(
      new UpdateUserPoolClientCommand({
        ...clientCommon,
        ClientId: clientId,
      }),
    )
    // Secret cannot be retrieved after create. If you lost it, delete the
    // client and re-run this script.
    const described = await cognito.send(
      new DescribeUserPoolClientCommand({
        UserPoolId: args.poolId,
        ClientId:   clientId,
      }),
    )
    clientSecret = described.UserPoolClient?.ClientSecret
    console.log(
      `✓ Patched app client ${args.clientName} (${clientId}) — using its existing secret`,
    )
  }

  // ── 3. Print the env block ─────────────────────────────────────────────────
  console.log('\n=================================')
  console.log('  Copy into env / secret store')
  console.log('=================================')
  console.log(`COGNITO_M2M_CLIENT_ID=${clientId}`)
  if (clientSecret) {
    console.log(`COGNITO_M2M_CLIENT_SECRET=${clientSecret}`)
  } else {
    console.log(`# COGNITO_M2M_CLIENT_SECRET=<recover by deleting + recreating the client>`)
  }
  console.log(`COGNITO_M2M_SCOPE=${fullScope}`)
  console.log(`# admin-api side:`)
  console.log(`M2M_RESOURCE_SERVER_ID=${args.identifier}`)
  console.log(`M2M_REQUIRED_SCOPE=${fullScope}`)
}

main().catch((err) => {
  console.error('setup-cognito-m2m failed:', err)
  process.exitCode = 1
})
