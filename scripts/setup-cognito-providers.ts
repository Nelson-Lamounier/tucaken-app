/**
 * Tucaken — Cognito Social Providers Setup
 *
 * Configures Google and GitHub (via OIDC bridge Lambda) as identity providers
 * in your Cognito User Pool using the dev-account AWS profile.
 *
 * Usage:
 *   npx tsx scripts/setup-cognito-providers.ts
 *   npx tsx scripts/setup-cognito-providers.ts --region us-east-1 --pool-id us-east-1_abc123
 */

import {
  CognitoIdentityProviderClient,
  ListUserPoolsCommand,
  DescribeUserPoolCommand,
  ListUserPoolClientsCommand,
  DescribeUserPoolClientCommand,
  CreateIdentityProviderCommand,
  UpdateIdentityProviderCommand,
  UpdateUserPoolClientCommand,
  type UserPoolDescriptionType,
  type UserPoolClientType,
} from '@aws-sdk/client-cognito-identity-provider'
import {
  LambdaClient,
  CreateFunctionCommand,
  UpdateFunctionCodeCommand,
  UpdateFunctionConfigurationCommand,
  GetFunctionCommand,
  AddPermissionCommand,
  type FunctionConfiguration,
} from '@aws-sdk/client-lambda'
import {
  ApiGatewayV2Client,
  CreateApiCommand,
  CreateIntegrationCommand,
  CreateRouteCommand,
  CreateStageCommand,
  GetApisCommand,
  type Api,
} from '@aws-sdk/client-apigatewayv2'
import {
  IAMClient,
  CreateRoleCommand,
  GetRoleCommand,
  AttachRolePolicyCommand,
} from '@aws-sdk/client-iam'
import { fromIni } from '@aws-sdk/credential-providers'
import { createInterface } from 'readline'
import { execFileSync } from 'child_process'
import { writeFileSync, readFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import crypto from 'crypto'

// ─── Constants ────────────────────────────────────────────────────────────────

const AWS_PROFILE = 'dev-account'
const LAMBDA_FN_NAME = 'tucaken-github-oidc-proxy'
const LAMBDA_ROLE_NAME = 'tucaken-github-oidc-proxy-role'
const API_NAME = 'tucaken-github-oidc-proxy'

// ─── ANSI helpers ─────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  teal: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
}

const ok = (msg: string) => console.log(`  ${c.green}✓${c.reset}  ${msg}`)
const info = (msg: string) => console.log(`  ${c.teal}→${c.reset}  ${msg}`)
const step = (n: number, total: number, label: string, detail: string) =>
  console.log(`\n  ${c.dim}[${n}/${total}]${c.reset}  ${c.bold}${label.padEnd(14)}${c.reset}${c.gray} ─── ${c.reset}${detail}`)

const banner = (title: string) => {
  console.log(`\n\n  ${c.bold}${c.teal}❯ ${title}${c.reset}`)
  console.log(`  ${c.dim}${'─'.repeat(54)}${c.reset}`)
}

// ─── CLI / Interactive helpers ─────────────────────────────────────────────────

const args = process.argv.slice(2)
const getArg = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined }

const rl = createInterface({ input: process.stdin, output: process.stdout })

const prompt = (question: string, defaultValue?: string): Promise<string> =>
  new Promise((resolve) => {
    const suffix = defaultValue ? ` ${c.dim}[${defaultValue}]${c.reset}` : ''
    rl.question(`  ${c.bold}?${c.reset}  ${question}${suffix}: `, (ans) => resolve(ans.trim() || defaultValue || ''))
  })

const pause = (msg: string): Promise<void> =>
  new Promise((resolve) => {
    console.log(msg)
    rl.question(`  ${c.dim}Press Enter when ready...${c.reset} `, () => resolve())
  })

// ─── AWS client factory ────────────────────────────────────────────────────────

function makeClients(region: string) {
  const credentials = fromIni({ profile: AWS_PROFILE })
  const cfg = { region, credentials }
  return {
    cognito: new CognitoIdentityProviderClient(cfg),
    lambda: new LambdaClient(cfg),
    apigw: new ApiGatewayV2Client(cfg),
    iam: new IAMClient({ credentials, region: 'us-east-1' }), // IAM is global
  }
}

// ─── Account ID via STS ────────────────────────────────────────────────────────

let _accountId: string | undefined
async function getAccountId(region: string): Promise<string> {
  if (_accountId) return _accountId
  const { STSClient, GetCallerIdentityCommand } = await import('@aws-sdk/client-sts')
  const sts = new STSClient({ region, credentials: fromIni({ profile: AWS_PROFILE }) })
  const res = await sts.send(new GetCallerIdentityCommand({}))
  if (!res.Account) throw new Error('Could not determine AWS Account ID from STS.')
  _accountId = res.Account
  return _accountId
}

// ─── User Pool discovery ───────────────────────────────────────────────────────

async function findUserPool(
  cognito: CognitoIdentityProviderClient,
  poolId?: string,
): Promise<UserPoolDescriptionType & { id: string }> {
  if (poolId) {
    const res = await cognito.send(new DescribeUserPoolCommand({ UserPoolId: poolId }))
    return { ...res.UserPool!, id: res.UserPool!.Id! }
  }

  const pools: UserPoolDescriptionType[] = []
  let token: string | undefined
  do {
    const res = await cognito.send(new ListUserPoolsCommand({ MaxResults: 60, NextToken: token }))
    pools.push(...(res.UserPools ?? []))
    token = res.NextToken
  } while (token)

  if (pools.length === 0) throw new Error('No Cognito User Pools found in this account/region.')
  if (pools.length === 1) return { ...pools[0], id: pools[0].Id! }

  console.log('\n  Multiple User Pools found:')
  pools.forEach((p, i) => console.log(`    ${c.bold}${i + 1}${c.reset}. ${p.Name} (${p.Id})`))
  const choice = await prompt('Select pool number', '1')
  const idx = parseInt(choice, 10) - 1
  if (idx < 0 || idx >= pools.length) throw new Error('Invalid selection')
  return { ...pools[idx], id: pools[idx].Id! }
}

async function findAppClient(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
): Promise<UserPoolClientType> {
  const res = await cognito.send(new ListUserPoolClientsCommand({ UserPoolId: poolId, MaxResults: 60 }))
  const clients = res.UserPoolClients ?? []
  if (clients.length === 0) throw new Error('No App Clients found in this User Pool.')

  let clientId: string
  if (clients.length === 1) {
    clientId = clients[0].ClientId!
  } else {
    console.log('\n  Multiple App Clients found:')
    clients.forEach((cl, i) => console.log(`    ${c.bold}${i + 1}${c.reset}. ${cl.ClientName} (${cl.ClientId})`))
    const choice = await prompt('Select client number', '1')
    clientId = clients[parseInt(choice, 10) - 1].ClientId!
  }

  const detail = await cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: poolId, ClientId: clientId }),
  )
  return detail.UserPoolClient!
}

// ─── App Client — add providers ────────────────────────────────────────────────

async function updateAppClientProviders(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  appClient: UserPoolClientType,
  newProviders: string[],
) {
  const existing = appClient.SupportedIdentityProviders ?? []
  const merged = [...new Set([...existing, ...newProviders, 'COGNITO'])]

  await cognito.send(
    new UpdateUserPoolClientCommand({
      UserPoolId: poolId,
      ClientId: appClient.ClientId!,
      ClientName: appClient.ClientName,
      SupportedIdentityProviders: merged,
      AllowedOAuthFlows: appClient.AllowedOAuthFlows?.length ? appClient.AllowedOAuthFlows : ['code'],
      AllowedOAuthScopes: appClient.AllowedOAuthScopes?.length
        ? appClient.AllowedOAuthScopes
        : ['email', 'openid', 'profile'],
      AllowedOAuthFlowsUserPoolClient: true,
      CallbackURLs: appClient.CallbackURLs,
      LogoutURLs: appClient.LogoutURLs,
      ExplicitAuthFlows: appClient.ExplicitAuthFlows,
      RefreshTokenValidity: appClient.RefreshTokenValidity,
      AccessTokenValidity: appClient.AccessTokenValidity,
      IdTokenValidity: appClient.IdTokenValidity,
      TokenValidityUnits: appClient.TokenValidityUnits,
      ReadAttributes: appClient.ReadAttributes,
      WriteAttributes: appClient.WriteAttributes,
      PreventUserExistenceErrors: appClient.PreventUserExistenceErrors,
      EnableTokenRevocation: appClient.EnableTokenRevocation,
    }),
  )
}

// ─── Google IdP ────────────────────────────────────────────────────────────────

async function configureGoogle(
  cognito: CognitoIdentityProviderClient,
  poolId: string,
  appClient: UserPoolClientType,
  cognitoDomain: string,
  region: string,
) {
  banner('① GOOGLE SIGN-IN / SIGN-UP')

  const idpRedirect = `https://${cognitoDomain}.auth.${region}.amazoncognito.com/oauth2/idpresponse`

  await pause(`
  ${c.bold}Next step — Create a Google OAuth 2.0 client${c.reset}

  1. Open this URL in your browser:
     ${c.teal}→ https://console.cloud.google.com/apis/credentials${c.reset}

  2. Click  "Create Credentials"  →  "OAuth 2.0 Client ID"

  3. Set  Application type  →  "Web application"

  4. Under "Authorized redirect URIs" add this exact URI:
     ${c.green}→ ${idpRedirect}${c.reset}

  5. Click "Create" — Google will show Client ID and Client Secret.
     (keep the tab open, you'll paste them next)
`)

  const googleClientId = await prompt('Google Client ID')
  const googleClientSecret = await prompt('Google Client Secret')
  if (!googleClientId || !googleClientSecret) throw new Error('Google credentials are required.')

  step(4, 9, 'Configuring', 'Google identity provider in Cognito')

  const providerDetails = {
    client_id: googleClientId,
    client_secret: googleClientSecret,
    authorize_scopes: 'email openid profile',
  }
  const attributeMapping = {
    email: 'email',
    given_name: 'given_name',
    family_name: 'family_name',
    username: 'sub',
    picture: 'picture',
  }

  try {
    await cognito.send(
      new CreateIdentityProviderCommand({
        UserPoolId: poolId,
        ProviderName: 'Google',
        ProviderType: 'Google',
        ProviderDetails: providerDetails,
        AttributeMapping: attributeMapping,
      }),
    )
    ok('Google provider created')
  } catch (e: any) {
    if (e.name !== 'DuplicateProviderException') throw e
    await cognito.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: poolId,
        ProviderName: 'Google',
        ProviderDetails: providerDetails,
        AttributeMapping: attributeMapping,
      }),
    )
    ok('Google provider updated (already existed)')
  }

  step(5, 9, 'Updating', 'App Client — enabling Google')
  await updateAppClientProviders(cognito, poolId, appClient, ['Google'])
  ok('App Client updated')
}

// ─── GitHub OIDC bridge — Lambda source code ───────────────────────────────────
//
// This handler implements a minimal OIDC Authorization Server that wraps
// GitHub's OAuth 2.0 flow. It uses only Node.js built-ins (no npm deps)
// so it can be deployed as a single-file Lambda ZIP.
//
// Flow:
//   Cognito → /authorize  →  GitHub OAuth
//   GitHub  → /callback   →  (exchange code, issue proxy code)  →  Cognito /oauth2/idpresponse
//   Cognito → /token      →  (decode proxy code, return JWT)
//   Cognito → /userinfo   →  GitHub API

const LAMBDA_HANDLER_CODE = /* javascript */ `
'use strict';
const https = require('https');
const crypto = require('crypto');
const { URLSearchParams } = require('url');

const GITHUB_CLIENT_ID     = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const PRIVATE_KEY          = process.env.PRIVATE_KEY;
const PUBLIC_KEY           = process.env.PUBLIC_KEY;
const BASE_URL             = process.env.BASE_URL;

// ── Utilities ──────────────────────────────────────────────────────────────────

function b64url(val) {
  const s = typeof val === 'string' ? val : JSON.stringify(val);
  return Buffer.from(s).toString('base64url');
}
function fromB64url(s) {
  return JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
}

function makeJwt(payload) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: '1' }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = crypto.sign('sha256', Buffer.from(header + '.' + body), PRIVATE_KEY)
                       .toString('base64url');
  return header + '.' + body + '.' + sig;
}

function httpsGet(url, headers) {
  return new Promise(function(resolve, reject) {
    https.get(url, { headers: headers }, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { try { resolve(JSON.parse(d)); } catch(_) { resolve(d); } });
    }).on('error', reject);
  });
}

function httpsPost(url, body, headers) {
  return new Promise(function(resolve, reject) {
    var u = new URL(url);
    var opts = {
      host: u.hostname, path: u.pathname, method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, headers),
    };
    var req = https.request(opts, function(res) {
      var d = '';
      res.on('data', function(c) { d += c; });
      res.on('end', function() { try { resolve(JSON.parse(d)); } catch(_) { resolve(d); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(body),
  };
}

function primaryEmail(emails, fallback) {
  if (!Array.isArray(emails)) return fallback;
  var found = emails.find(function(e) { return e.primary && e.verified; });
  return (found || emails[0] || {}).email || fallback;
}

// ── Handler ────────────────────────────────────────────────────────────────────

exports.handler = async function(event) {
  var path   = event.rawPath || event.path || '/';
  var method = ((event.requestContext && event.requestContext.http
                  ? event.requestContext.http.method
                  : event.httpMethod) || 'GET').toUpperCase();
  var qs   = event.queryStringParameters || {};
  var hdrs = event.headers || {};

  // OPTIONS (CORS pre-flight)
  if (method === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST', 'Access-Control-Allow-Headers': 'Authorization,Content-Type' }, body: '' };
  }

  // ── OIDC Discovery ────────────────────────────────────────────────────────────
  if (path === '/.well-known/openid-configuration') {
    return json(200, {
      issuer:                                BASE_URL,
      authorization_endpoint:               BASE_URL + '/authorize',
      token_endpoint:                        BASE_URL + '/token',
      userinfo_endpoint:                     BASE_URL + '/userinfo',
      jwks_uri:                              BASE_URL + '/.well-known/jwks.json',
      response_types_supported:              ['code'],
      subject_types_supported:               ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported:                      ['openid', 'user:email'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
      claims_supported:                      ['sub', 'email', 'email_verified', 'name', 'preferred_username', 'picture'],
    });
  }

  // ── JWKS endpoint ─────────────────────────────────────────────────────────────
  if (path === '/.well-known/jwks.json') {
    var jwk = crypto.createPublicKey(PUBLIC_KEY).export({ format: 'jwk' });
    return json(200, { keys: [Object.assign({}, jwk, { use: 'sig', alg: 'RS256', kid: '1' })] });
  }

  // ── /authorize — redirect user to GitHub ──────────────────────────────────────
  if (path === '/authorize') {
    var proxyState = b64url({ redirect_uri: qs.redirect_uri, state: qs.state, nonce: qs.nonce || '' });
    var params = new URLSearchParams({
      client_id:    GITHUB_CLIENT_ID,
      redirect_uri: BASE_URL + '/callback',
      scope:        'read:user user:email',
      state:        proxyState,
    });
    return {
      statusCode: 302,
      headers: { Location: 'https://github.com/login/oauth/authorize?' + params.toString() },
      body: '',
    };
  }

  // ── /callback — GitHub posts code here; exchange it and redirect to Cognito ───
  if (path === '/callback') {
    var code = qs.code;
    var cognitoRedirectUri, cognitoState, nonce;
    try {
      var decoded = fromB64url(qs.state);
      cognitoRedirectUri = decoded.redirect_uri;
      cognitoState       = decoded.state;
      nonce              = decoded.nonce;
    } catch(e) {
      return { statusCode: 400, body: 'invalid state parameter' };
    }

    var tok = await httpsPost(
      'https://github.com/login/oauth/access_token',
      JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code: code }),
      { Accept: 'application/json' }
    );

    if (!tok.access_token) {
      return { statusCode: 400, body: 'GitHub token exchange failed: ' + JSON.stringify(tok) };
    }

    var ghH = { Authorization: 'Bearer ' + tok.access_token, 'User-Agent': 'tucaken-oidc-proxy/1.0', Accept: 'application/json' };
    var results = await Promise.all([
      httpsGet('https://api.github.com/user', ghH),
      httpsGet('https://api.github.com/user/emails', ghH),
    ]);
    var user = results[0];
    var email = primaryEmail(results[1], user.email);

    var now = Math.floor(Date.now() / 1000);
    var idToken = makeJwt({
      iss: BASE_URL, sub: String(user.id), aud: GITHUB_CLIENT_ID,
      exp: now + 600, iat: now,
      nonce: nonce || undefined,
      email: email, email_verified: true,
      name: user.name || user.login,
      preferred_username: user.login,
      picture: user.avatar_url,
    });

    // Encode tokens as a short-lived proxy code (base64url JSON bundle)
    var proxyCode = b64url({ access_token: tok.access_token, id_token: idToken });
    var dest = new URL(cognitoRedirectUri);
    dest.searchParams.set('code', proxyCode);
    if (cognitoState) dest.searchParams.set('state', cognitoState);
    return { statusCode: 302, headers: { Location: dest.toString() }, body: '' };
  }

  // ── /token — Cognito exchanges proxy code for access + id tokens ───────────────
  if (path === '/token' && method === 'POST') {
    var raw = event.body
      ? (event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body)
      : '';
    var proxyCode = new URLSearchParams(raw).get('code');
    if (!proxyCode) return json(400, { error: 'invalid_request', error_description: 'missing code' });
    var tokens;
    try { tokens = fromB64url(proxyCode); }
    catch(e) { return json(400, { error: 'invalid_grant', error_description: e.message }); }
    return json(200, { access_token: tokens.access_token, id_token: tokens.id_token, token_type: 'Bearer', expires_in: 600 });
  }

  // ── /userinfo ─────────────────────────────────────────────────────────────────
  if (path === '/userinfo') {
    var authH = hdrs.authorization || hdrs.Authorization || '';
    var accessToken = authH.replace(/^Bearer\\s+/i, '');
    var ghH2 = { Authorization: 'Bearer ' + accessToken, 'User-Agent': 'tucaken-oidc-proxy/1.0', Accept: 'application/json' };
    var results2 = await Promise.all([
      httpsGet('https://api.github.com/user', ghH2),
      httpsGet('https://api.github.com/user/emails', ghH2),
    ]);
    var u = results2[0];
    var em = primaryEmail(results2[1], u.email);
    return json(200, { sub: String(u.id), email: em, email_verified: true, name: u.name || u.login, preferred_username: u.login, picture: u.avatar_url });
  }

  return { statusCode: 404, body: 'not found' };
};
`

// ─── Lambda ZIP builder ────────────────────────────────────────────────────────

function buildLambdaZip(): Buffer {
  const tmpDir = join(tmpdir(), `tucaken-oidc-${Date.now()}`)
  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(join(tmpDir, 'index.js'), LAMBDA_HANDLER_CODE)

  // execFileSync — no shell, no injection risk; tmpDir is generated internally
  execFileSync('zip', ['-q', 'lambda.zip', 'index.js'], { cwd: tmpDir })

  const buf = readFileSync(join(tmpDir, 'lambda.zip'))
  rmSync(tmpDir, { recursive: true, force: true })
  return buf
}

// ─── IAM Role ─────────────────────────────────────────────────────────────────

async function ensureLambdaRole(iam: IAMClient): Promise<string> {
  try {
    const res = await iam.send(new GetRoleCommand({ RoleName: LAMBDA_ROLE_NAME }))
    ok(`IAM role already exists: ${LAMBDA_ROLE_NAME}`)
    return res.Role!.Arn!
  } catch (e: any) {
    if (e.name !== 'NoSuchEntityException') throw e
  }

  const res = await iam.send(
    new CreateRoleCommand({
      RoleName: LAMBDA_ROLE_NAME,
      AssumeRolePolicyDocument: JSON.stringify({
        Version: '2012-10-17',
        Statement: [{ Effect: 'Allow', Principal: { Service: 'lambda.amazonaws.com' }, Action: 'sts:AssumeRole' }],
      }),
      Description: 'Execution role for Tucaken GitHub OIDC proxy',
    }),
  )
  await iam.send(
    new AttachRolePolicyCommand({
      RoleName: LAMBDA_ROLE_NAME,
      PolicyArn: 'arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole',
    }),
  )
  ok(`IAM role created: ${LAMBDA_ROLE_NAME}`)
  info('Waiting 10 s for IAM propagation...')
  await new Promise((r) => setTimeout(r, 10_000))
  return res.Role!.Arn!
}

// ─── Lambda function ───────────────────────────────────────────────────────────

async function ensureLambdaFunction(
  lambda: LambdaClient,
  roleArn: string,
  envVars: Record<string, string>,
): Promise<FunctionConfiguration> {
  const zip = buildLambdaZip()
  let existing: FunctionConfiguration | undefined

  try {
    const res = await lambda.send(new GetFunctionCommand({ FunctionName: LAMBDA_FN_NAME }))
    existing = res.Configuration
  } catch (e: any) {
    if (e.name !== 'ResourceNotFoundException') throw e
  }

  if (existing) {
    await lambda.send(new UpdateFunctionCodeCommand({ FunctionName: LAMBDA_FN_NAME, ZipFile: zip }))
    await new Promise((r) => setTimeout(r, 4_000)) // wait for code update
    await lambda.send(
      new UpdateFunctionConfigurationCommand({
        FunctionName: LAMBDA_FN_NAME,
        Environment: { Variables: envVars },
        Timeout: 30,
      }),
    )
    ok('Lambda updated')
    return existing
  }

  const res = await lambda.send(
    new CreateFunctionCommand({
      FunctionName: LAMBDA_FN_NAME,
      Runtime: 'nodejs20.x',
      Role: roleArn,
      Handler: 'index.handler',
      Code: { ZipFile: zip },
      Timeout: 30,
      Description: 'Tucaken GitHub OIDC proxy for Cognito federation',
      Environment: { Variables: envVars },
    }),
  )
  ok('Lambda created')
  return res
}

// ─── HTTP API Gateway ──────────────────────────────────────────────────────────

async function ensureHttpApi(
  apigw: ApiGatewayV2Client,
  lambda: LambdaClient,
  region: string,
): Promise<{ apiId: string; apiUrl: string }> {
  const list = await apigw.send(new GetApisCommand({}))
  const existing = (list.Items ?? []).find((a: Api) => a.Name === API_NAME)
  if (existing) {
    ok(`HTTP API already exists: ${existing.ApiId}`)
    return { apiId: existing.ApiId!, apiUrl: `https://${existing.ApiId}.execute-api.${region}.amazonaws.com` }
  }

  const accountId = await getAccountId(region)
  const lambdaArn = `arn:aws:lambda:${region}:${accountId}:function:${LAMBDA_FN_NAME}`

  const api = await apigw.send(new CreateApiCommand({ Name: API_NAME, ProtocolType: 'HTTP' }))
  const apiId = api.ApiId!
  const apiUrl = `https://${apiId}.execute-api.${region}.amazonaws.com`

  const integration = await apigw.send(
    new CreateIntegrationCommand({
      ApiId: apiId,
      IntegrationType: 'AWS_PROXY',
      IntegrationUri: lambdaArn,
      PayloadFormatVersion: '2.0',
    }),
  )

  await apigw.send(
    new CreateRouteCommand({ ApiId: apiId, RouteKey: '$default', Target: `integrations/${integration.IntegrationId}` }),
  )
  await apigw.send(new CreateStageCommand({ ApiId: apiId, StageName: '$default', AutoDeploy: true }))

  // Grant API Gateway permission to invoke Lambda
  try {
    await lambda.send(
      new AddPermissionCommand({
        FunctionName: LAMBDA_FN_NAME,
        StatementId: 'AllowApiGatewayInvoke',
        Action: 'lambda:InvokeFunction',
        Principal: 'apigateway.amazonaws.com',
        SourceArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/*`,
      }),
    )
  } catch (e: any) {
    if (e.name !== 'ResourceConflictException') throw e
  }

  ok(`HTTP API created: ${apiId}`)
  return { apiId, apiUrl }
}

// ─── GitHub IdP in Cognito ─────────────────────────────────────────────────────

async function configureGitHub(
  clients: ReturnType<typeof makeClients>,
  poolId: string,
  appClient: UserPoolClientType,
  region: string,
) {
  banner('② GITHUB SIGN-IN / SIGN-UP')

  step(6, 9, 'Generating', 'RSA-2048 key pair for JWT signing')
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  })
  ok('RSA key pair generated')

  step(7, 9, 'Deploying', 'IAM role')
  const roleArn = await ensureLambdaRole(clients.iam)

  step(7, 9, 'Deploying', 'Lambda — GitHub OIDC bridge')
  // Deploy with placeholder creds first; we need the API URL before finalising env vars
  await ensureLambdaFunction(clients.lambda, roleArn, {
    GITHUB_CLIENT_ID: 'placeholder',
    GITHUB_CLIENT_SECRET: 'placeholder',
    PRIVATE_KEY: privateKey,
    PUBLIC_KEY: publicKey,
    BASE_URL: 'https://placeholder.invalid',
  })

  step(7, 9, 'Deploying', 'HTTP API Gateway')
  const { apiUrl } = await ensureHttpApi(clients.apigw, clients.lambda, region)
  ok(`OIDC Bridge live at: ${apiUrl}`)

  await pause(`
  ${c.bold}Next step — Create a GitHub OAuth App${c.reset}

  1. Open this URL in your browser:
     ${c.teal}→ https://github.com/settings/applications/new${c.reset}

  2. Fill in these fields:
     ${c.dim}Application name:          ${c.reset}Tucaken Dev
     ${c.dim}Homepage URL:              ${c.reset}https://localhost:5001
     ${c.dim}Authorization callback URL:${c.reset}
       ${c.green}→ ${apiUrl}/callback${c.reset}

  3. Click "Register application"

  4. On the next screen, click "Generate a new client secret"
     Copy both the Client ID and the new Client Secret.
`)

  const githubClientId = await prompt('GitHub Client ID')
  const githubClientSecret = await prompt('GitHub Client Secret')
  if (!githubClientId || !githubClientSecret) throw new Error('GitHub credentials are required.')

  step(8, 9, 'Updating', 'Lambda — injecting GitHub credentials + BASE_URL')
  await clients.lambda.send(
    new UpdateFunctionConfigurationCommand({
      FunctionName: LAMBDA_FN_NAME,
      Timeout: 30,
      Environment: {
        Variables: {
          GITHUB_CLIENT_ID: githubClientId,
          GITHUB_CLIENT_SECRET: githubClientSecret,
          PRIVATE_KEY: privateKey,
          PUBLIC_KEY: publicKey,
          BASE_URL: apiUrl,
        },
      },
    }),
  )
  ok('Lambda fully configured')

  step(9, 9, 'Configuring', 'GitHub OIDC provider in Cognito')

  const providerDetails = {
    client_id: githubClientId,
    client_secret: githubClientSecret,
    attributes_request_method: 'GET',
    oidc_issuer: apiUrl,
    authorize_scopes: 'openid user:email',
  }
  const attributeMapping = {
    username: 'sub',
    email: 'email',
    name: 'name',
    preferred_username: 'preferred_username',
    picture: 'picture',
  }

  try {
    await clients.cognito.send(
      new CreateIdentityProviderCommand({
        UserPoolId: poolId,
        ProviderName: 'GitHub',
        ProviderType: 'OIDC',
        ProviderDetails: providerDetails,
        AttributeMapping: attributeMapping,
      }),
    )
    ok('GitHub OIDC provider created')
  } catch (e: any) {
    if (e.name !== 'DuplicateProviderException') throw e
    await clients.cognito.send(
      new UpdateIdentityProviderCommand({
        UserPoolId: poolId,
        ProviderName: 'GitHub',
        ProviderDetails: providerDetails,
        AttributeMapping: attributeMapping,
      }),
    )
    ok('GitHub OIDC provider updated (already existed)')
  }

  step(9, 9, 'Updating', 'App Client — enabling GitHub')
  await updateAppClientProviders(clients.cognito, poolId, appClient, ['GitHub'])
  ok('App Client updated')

  return apiUrl
}

// ─── Summary ───────────────────────────────────────────────────────────────────

function printSummary(opts: {
  cognitoDomain: string
  region: string
  clientId: string
  appUrl: string
  githubOidcUrl: string
}) {
  const base = `https://${opts.cognitoDomain}.auth.${opts.region}.amazoncognito.com`
  const redirectUri = encodeURIComponent(`${opts.appUrl}/sign-in/callback`)
  const testQs = `client_id=${opts.clientId}&response_type=code&scope=email+openid+profile&redirect_uri=${redirectUri}`

  console.log(`

  ${c.bold}${c.green}╔══════════════════════════════════════════════════╗${c.reset}
  ${c.bold}${c.green}║  All done ✓  Both providers are configured.      ║${c.reset}
  ${c.bold}${c.green}╚══════════════════════════════════════════════════╝${c.reset}

  ${c.bold}Test Google sign-in:${c.reset}
  ${c.teal}${base}/oauth2/authorize?${testQs}&identity_provider=Google${c.reset}

  ${c.bold}Test GitHub sign-in:${c.reset}
  ${c.teal}${base}/oauth2/authorize?${testQs}&identity_provider=GitHub${c.reset}

  ${c.dim}${'─'.repeat(54)}${c.reset}

  ${c.bold}${c.yellow}Reminder — verify these in your external accounts:${c.reset}

  ${c.yellow}Google Cloud Console${c.reset}  (Credentials → OAuth 2.0 Client)
    Authorized redirect URI must include:
    ${c.green}→ ${base}/oauth2/idpresponse${c.reset}

  ${c.yellow}GitHub OAuth App${c.reset}  (Settings → Developer settings → OAuth Apps)
    Authorization callback URL must be:
    ${c.green}→ ${opts.githubOidcUrl}/callback${c.reset}

  ${c.dim}${'─'.repeat(54)}${c.reset}

  ${c.bold}GitHub OIDC Bridge (keep this running — Cognito calls it):${c.reset}
    ${opts.githubOidcUrl}
    Lambda function:  ${LAMBDA_FN_NAME}
    IAM role:         ${LAMBDA_ROLE_NAME}

  `)
}

// ─── Entry point ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`
  ${c.bold}${c.teal}╔══════════════════════════════════════════════════╗${c.reset}
  ${c.bold}${c.teal}║   Tucaken — Cognito Social Providers Setup       ║${c.reset}
  ${c.bold}${c.teal}║   AWS Profile: ${AWS_PROFILE.padEnd(33)}║${c.reset}
  ${c.bold}${c.teal}╚══════════════════════════════════════════════════╝${c.reset}`)

  let region = getArg('--region') ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION
  if (!region) region = await prompt('AWS Region', 'us-east-1')

  const clients = makeClients(region)

  step(1, 9, 'Connecting', `profile: ${AWS_PROFILE}  region: ${region}`)
  await getAccountId(region) // validates credentials early
  ok('Connected to AWS')

  step(2, 9, 'Discovering', 'Cognito User Pool')
  const pool = await findUserPool(clients.cognito, getArg('--pool-id'))
  const poolDetail = await clients.cognito.send(new DescribeUserPoolCommand({ UserPoolId: pool.id }))
  const cognitoDomain = poolDetail.UserPool?.Domain
  if (!cognitoDomain) {
    throw new Error(
      `User Pool "${pool.Name}" has no Cognito domain.\n` +
      `  Configure one: AWS Console → User Pool → App integration → Domain`,
    )
  }
  ok(`User Pool: ${pool.Name}  (${pool.id})`)
  info(`Domain: ${cognitoDomain}.auth.${region}.amazoncognito.com`)

  step(3, 9, 'Discovering', 'App Client')
  const appClient = await findAppClient(clients.cognito, pool.id)
  ok(`App Client: ${appClient.ClientName}  (${appClient.ClientId})`)

  const appUrl =
    process.env.VITE_APP_URL ??
    (await prompt('App base URL (for callback URL display)', 'http://localhost:5001'))

  await configureGoogle(clients.cognito, pool.id, appClient, cognitoDomain, region)

  // Re-fetch App Client so the GitHub step sees the updated SupportedIdentityProviders
  const refreshed = await clients.cognito.send(
    new DescribeUserPoolClientCommand({ UserPoolId: pool.id, ClientId: appClient.ClientId! }),
  )
  const githubOidcUrl = await configureGitHub(clients, pool.id, refreshed.UserPoolClient!, region)

  printSummary({ cognitoDomain, region, clientId: appClient.ClientId!, appUrl, githubOidcUrl })

  rl.close()
}

main().catch((err) => {
  console.error(`\n  ${c.red}✗  Error:${c.reset}  ${err.message}\n`)
  if (process.env.DEBUG) console.error(err.stack)
  rl.close()
  process.exit(1)
})
