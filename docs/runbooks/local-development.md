---
title: Local development - tucaken-app + admin-api
type: runbook
tags: [local-development, operations, onboarding, tooling]
sources:
  - justfile
  - package.json
  - scripts/local-dev.ts
  - scripts/create-test-user.ts
  - scripts/reset-test-user.ts
  - admin-api/package.json
  - admin-api/scripts/local-admin-api.sh
created: 2026-06-16
updated: 2026-06-16
---

## When to run this

Use this runbook to bring up Tucaken locally - either the Vite dev server on its own
for UI work, or the full stack (containerised tucaken-app wired to admin-api) for
end-to-end testing - and to manage the dev test user. The repo standardises on
[`just`](../../justfile) recipes that wrap the underlying scripts; this runbook leads
with those and shows the raw command each recipe runs so you can see what is happening.

Three common scenarios:

- **UI-only work** - `just dev` (or `just dev-mock` to skip Cognito/admin-api).
- **Full local stack** - admin-api container plus a containerised tucaken-app, wired
  over a shared Docker network ([`scripts/local-dev.ts`](../../scripts/local-dev.ts)).
- **Stack against the dev cluster** - tucaken-app container pointed at the real dev
  admin-api pod via a `kubectl port-forward` (`--cluster` mode).

For Cognito provider configuration (Google/GitHub sign-in, password auth) and pool
prerequisites, see [cognito-setup.md](./cognito-setup.md).

## Prerequisites

- **Yarn 4** - `packageManager: yarn@4.12.0` in [`package.json`](../../package.json).
  Run `yarn install` once. Never use npm/pnpm.
- **just** - the task runner. Install with `brew install just` (per the
  [`justfile`](../../justfile) header).
- **Node + tsx** - the local scripts run via `npx tsx` (see the `local`,
  `create-test-user`, `reset-test-user` recipes in the [`justfile`](../../justfile)).
- **Docker** - Docker Desktop or colima, for the containerised stack
  ([`admin-api/scripts/local-admin-api.sh`](../../admin-api/scripts/local-admin-api.sh)
  pre-flight).
- **`.env.local` at the repo root** - read by
  [`scripts/local-dev.ts`](../../scripts/local-dev.ts); missing means Cognito auth will
  fail. Must include `AUTH_COGNITO_ISSUER_URL` - the test-user scripts derive the
  Cognito pool id and region from it
  ([`scripts/create-test-user.ts`](../../scripts/create-test-user.ts)).
- **`~/.aws` with a `dev-account` profile** - mounted read-only into the container and
  used by the AWS SDK. `AWS_PROFILE` defaults to `dev-account`. For SSO, run
  `aws sso login --profile dev-account` first.
- **admin-api `.env`** - for the full local stack, copy
  `admin-api/.env.example` to `admin-api/.env` and fill it in (checked by
  [`local-admin-api.sh`](../../admin-api/scripts/local-admin-api.sh)).

## Procedure

### Option A - UI-only dev server

The fastest loop. Vite dev runs on port 5001 (`dev` script in
[`package.json`](../../package.json)).

```bash
# Standard dev server (real Cognito + admin-api)
just dev

# UI work with no Cognito/RDS - fake auth + mocked admin-api
just dev-mock
```

`just dev` runs `yarn dev` (= `vite dev --port 5001`). `just dev-mock` runs the same
with `MOCK_AUTH=true VITE_MOCK_AUTH=true`, intended for `/onboarding` UI work.

### Option B - full local stack (Docker)

1. Start admin-api first. Per the [`local-dev.ts`](../../scripts/local-dev.ts) header,
   the admin-api container is managed by the cdk-monitoring repo
   (`just admin-api-up` there). To build and run admin-api directly from this repo,
   use its own script
   ([`admin-api/scripts/local-admin-api.sh`](../../admin-api/scripts/local-admin-api.sh)),
   which stops any running container, builds the image, verifies AWS credentials, and
   starts it on port 3002:

   ```bash
   ./admin-api/scripts/local-admin-api.sh
   # or pin the profile:
   AWS_PROFILE=dev-account ./admin-api/scripts/local-admin-api.sh
   ```

   Verify it is healthy: `curl http://localhost:3002/healthz`.

2. Build the tucaken-app image and start the container, wired to admin-api over the
   shared `local-cluster` Docker network:

   ```bash
   just local            # build image + start container
   just local-fast       # reuse cached image (skip docker build)
   just local-logs       # start and tail container logs
   ```

   These run `npx tsx scripts/local-dev.ts` (with `--no-rebuild` / `--logs`). The
   script creates the `local-cluster` network if needed, joins admin-api to it under
   the DNS alias `admin-api`, builds the image, and starts the `tucaken-app-local`
   container on port 5001 with `ADMIN_API_URL=http://admin-api:3002`. It then waits up
   to 120s for the container health check.

### Option C - stack against the dev cluster

No local admin-api container needed. The script opens a `kubectl port-forward` to the
`svc/admin-api` Service in the `admin-api` namespace on localhost:3002, and runs the
tucaken-app container pointing at `http://host.docker.internal:3002`
([`scripts/local-dev.ts`](../../scripts/local-dev.ts)). Requires a valid kubeconfig and
access to the development cluster.

```bash
just local-cluster        # build image + port-forward + start
just local-cluster-fast   # cached image
just local-cluster-logs   # cluster mode + tail logs
```

### Option D - create and manage the test user

The test user is a `role=user` account (not in the `admin` Cognito group), so it lands
in RDS with a 14-day trial and hits the full new-user flow
([`scripts/create-test-user.ts`](../../scripts/create-test-user.ts)).

```bash
# Create once - credentials are written to .env.local
just create-test-user
```

This runs `npx tsx scripts/create-test-user.ts`. It derives the pool id and region from
`AUTH_COGNITO_ISSUER_URL`, creates the user `test+dev@nelsonlamounier.com` with a
suppressed welcome email and a permanent password (so no forced reset on first sign-in),
and saves `VITE_TEST_USER_EMAIL` / `VITE_TEST_USER_PASSWORD` to `.env.local`. If the
user already exists it leaves the password unchanged and prints a reminder to reset.

The script's printed next steps for exercising onboarding:

1. Uncomment `VITE_DEV_FORCE_ONBOARDING=true` in `.env.local`.
2. `yarn dev`.
3. Visit `http://localhost:5001` - you are redirected to `/onboarding`.
4. Sign in with the printed credentials via the Cognito hosted UI.

To wipe a test user from both Cognito and RDS, use the interactive picker
([`scripts/reset-test-user.ts`](../../scripts/reset-test-user.ts)):

```bash
just reset-test-user                          # interactive picker
just reset-test-user --email=foo@bar.com      # target one user
just reset-test-user --yes                     # skip confirmation
```

RDS cleanup runs via `kubectl exec` into the `pgbouncer` pod in the `platform`
namespace, so the cluster connection must be reachable; if kubectl is unavailable the
script falls back to Cognito-only listing.

## Verification

- **Dev server (Option A)**: open `http://localhost:5001/` - the dev server logs the
  Vite URL on start.
- **admin-api (Option B step 1)**: `curl http://localhost:3002/healthz` returns success;
  the script blocks until this passes (per
  [`local-admin-api.sh`](../../admin-api/scripts/local-admin-api.sh)).
- **Containerised tucaken-app (Options B/C)**: the script waits for the Docker health
  check and prints `tucaken-app running` with `http://localhost:5001/`. Tail logs with
  `docker logs -f tucaken-app-local`.
- **Test user (Option D)**: the script prints the email/password and confirms
  `Saved credentials to .env.local`. Confirm sign-in succeeds at
  `http://localhost:5001` via the Cognito hosted UI.

## Rollback / teardown

```bash
# Stop the local Docker stack (Option B)
just local-stop            # npx tsx scripts/local-dev.ts --stop

# Stop the cluster-mode container and kill the port-forward (Option C)
just local-cluster-stop    # npx tsx scripts/local-dev.ts --cluster --stop

# Stop admin-api (started via local-admin-api.sh)
docker compose -f admin-api/docker-compose.yml down
```

`just local-stop` removes the `tucaken-app-local` container; in cluster mode the
`--stop` path also terminates the saved port-forward PID
([`scripts/local-dev.ts`](../../scripts/local-dev.ts)). To remove the dev test user from
Cognito and RDS, run `just reset-test-user` (Option D).

<!--
  Evidence trail (verified 2026-06-16):
  - package.json:15 - "dev": "vite dev --port 5001"; scripts setup:cognito/update:cognito-prod use npx tsx
  - justfile:23-88 - dev, dev-mock, local, local-fast, local-logs, local-stop, local-cluster* recipes (all npx tsx scripts/local-dev.ts ...)
  - justfile:175-181 - create-test-user / reset-test-user recipes (npx tsx)
  - scripts/local-dev.ts:1-30 - header: two modes (local Docker via shared net, --cluster via kubectl port-forward); prereq `just admin-api-up` in cdk-monitoring
  - scripts/local-dev.ts:45-64,300-441 - APP_PORT 5001, NETWORK_NAME local-cluster, admin-api alias :3002, ADMIN_API_URL wiring, AWS_PROFILE dev-account, ~/.aws mounted ro, 120s health wait
  - scripts/create-test-user.ts:1-14,97-179 - role=user test account, email test+dev@nelsonlamounier.com, permanent password, writes VITE_TEST_USER_EMAIL/PASSWORD to .env.local, next-steps (VITE_DEV_FORCE_ONBOARDING, yarn dev, /onboarding)
  - scripts/reset-test-user.ts:1-36 - interactive RDS+Cognito wipe via kubectl exec into pgbouncer (namespace platform), --email/--yes flags, Cognito-only fallback
  - admin-api/package.json:8 - dev: tsx watch ... src/index.ts; admin-api/scripts/local-admin-api.sh:1-138 - .env + ~/.aws prereqs, port 3002, /healthz check, docker compose teardown
  - Cross-link: docs/runbooks/cognito-setup.md (exists)
-->
