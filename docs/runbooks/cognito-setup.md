---
title: Cognito User Pool provisioning and updates
type: runbook
tags: [operations, cognito, aws, authentication, oauth]
sources:
  - scripts/setup-cognito-providers.ts
  - scripts/setup-cognito-m2m.ts
  - scripts/update-cognito-prod.ts
  - scripts/enable-password-auth.ts
created: 2026-06-16
updated: 2026-06-16
---

## When to run this

Run one of these scripts when standing up or changing the Cognito User Pool that
backs authentication: configuring social identity providers, provisioning the
machine-to-machine (M2M) client used for internal service calls, enabling
password auth, or adding a production domain to the OAuth callback/logout URLs
after a deploy. Each script is idempotent and preserves existing configuration,
so re-running to reconcile drift is safe.

## Prerequisites

- AWS credentials for the dev account. The scripts authenticate with the
  `dev-account` profile via `fromIni`
  ([update-cognito-prod.ts](../../scripts/update-cognito-prod.ts#L26),
  [enable-password-auth.ts](../../scripts/enable-password-auth.ts#L20)).
- Node toolchain for `tsx` (the package scripts invoke it).
- The target User Pool id and region if auto-discovery should be bypassed —
  every script accepts `--pool-id` and `--region` flags.

## Procedure

**Configure social identity providers (Google, GitHub via OIDC bridge):**

```bash
yarn setup:cognito
# or target a specific pool:
npx tsx scripts/setup-cognito-providers.ts --region us-east-1 --pool-id us-east-1_abc123
```

This also creates/updates the GitHub OIDC bridge Lambda and its API Gateway HTTP
route ([setup-cognito-providers.ts](../../scripts/setup-cognito-providers.ts#L1-L40)).

**Provision the M2M resource server + confidential client:**

```bash
npx tsx scripts/setup-cognito-m2m.ts --pool-id eu-west-1_abc123 --region eu-west-1
```

The script prints `COGNITO_M2M_CLIENT_ID`, `COGNITO_M2M_CLIENT_SECRET` (shown
once), `COGNITO_M2M_SCOPE`, and the resource-server/required-scope values for
admin-api. Copy the secret into the tucaken-app pod's K8s secret and the
admin-api configmap, then redeploy
([setup-cognito-m2m.ts](../../scripts/setup-cognito-m2m.ts#L1-L27)).

**Enable password auth on the app client:**

```bash
just enable-password-auth
# or: npx tsx scripts/enable-password-auth.ts
```

Adds `ALLOW_USER_PASSWORD_AUTH` to the client's `ExplicitAuthFlows`, preserving
existing flows ([enable-password-auth.ts](../../scripts/enable-password-auth.ts#L1-L21)).

**Add the production domain to callback/logout URLs:**

```bash
just update-cognito-prod
# or: npx tsx scripts/update-cognito-prod.ts --region eu-west-1 --pool-id eu-west-1_mNRJM2InT
```

Existing localhost/staging URLs are preserved
([update-cognito-prod.ts](../../scripts/update-cognito-prod.ts#L1-L12)).

## Verification

- **M2M:** confirm the SSR pod can mint a token — a successful
  `client_credentials` exchange and a 2xx on an `/api/internal/*` call indicates
  the resource server, client, and scope are wired (see
  [Cognito JWT verification](../concepts/cognito-jwks-verification.md)).
- **Providers / password auth / URLs:** re-run the same script; an idempotent run
  reports the resource already present and patches in place rather than creating
  duplicates, confirming the desired state is applied.

## Rollback

These scripts are additive and preserve prior config, so the primary "rollback"
is to re-run with the corrected inputs. For the M2M client secret, rotate by
re-running `setup-cognito-m2m.ts` (it patches the existing client) and updating
the K8s secret + admin-api configmap, then redeploy. Callback/logout URL changes
are reverted by removing the added domain in the Cognito console or a follow-up
`UpdateUserPoolClient` call.

<!--
Evidence trail (auto-generated):
- Source: scripts/setup-cognito-providers.ts (read on 2026-06-16, lines 1-40)
- Source: scripts/setup-cognito-m2m.ts (read on 2026-06-16, lines 1-27)
- Source: scripts/update-cognito-prod.ts (read on 2026-06-16, lines 1-26)
- Source: scripts/enable-password-auth.ts (read on 2026-06-16, lines 1-21)
- Source: package.json (read on 2026-06-16, scripts setup:cognito, update:cognito-prod)
-->
