# tucaken-app — task runner
# Usage: just <recipe>  (install just: brew install just)

set dotenv-load := true

# ── Default ───────────────────────────────────────────────────────────────────

[private]
default:
    @just --list --unsorted

# ── Development ───────────────────────────────────────────────────────────────

# Start Vite dev server on :5001
dev:
    yarn dev

# Dev server with fake auth + mocked admin-api (no Cognito/RDS) — for /onboarding UI work
dev-mock:
    MOCK_AUTH=true VITE_MOCK_AUTH=true yarn dev

# Type-check without emitting
typecheck:
    yarn typecheck

# Run ESLint
lint:
    yarn lint

# Run test suite
test:
    yarn test

# Run tests in watch mode
test-watch:
    npx vitest

# ── Build ─────────────────────────────────────────────────────────────────────

# Production build (Vite + esbuild server bundle)
build:
    yarn build

# Preview production build locally
preview:
    yarn preview

# ── Local Docker ──────────────────────────────────────────────────────────────

# Build image and start tucaken-app container (requires admin-api running)
local:
    npx tsx scripts/local-dev.ts

# Start container using cached image — skip Docker build
local-fast:
    npx tsx scripts/local-dev.ts --no-rebuild

# Start container and tail logs
local-logs:
    npx tsx scripts/local-dev.ts --logs

# Stop and remove the local container
local-stop:
    npx tsx scripts/local-dev.ts --stop

# Build image and start container wired to the dev cluster via kubectl port-forward
local-cluster:
    npx tsx scripts/local-dev.ts --cluster

# Same but skip Docker build (use cached image)
local-cluster-fast:
    npx tsx scripts/local-dev.ts --cluster --no-rebuild

# Cluster mode + tail logs
local-cluster-logs:
    npx tsx scripts/local-dev.ts --cluster --logs

# Stop container and kill the port-forward
local-cluster-stop:
    npx tsx scripts/local-dev.ts --cluster --stop

# ── CI Smoke Test ─────────────────────────────────────────────────────────────

# Build image and run the Docker smoke test (mirrors ci.yml docker-build job)
smoke-test:
    #!/usr/bin/env bash
    set -euo pipefail
    TAG="tucaken-app:ci-test"
    CONTAINER="test-container"

    fail() {
        echo "==> Container logs:"
        docker logs "$CONTAINER" 2>&1 || true
        docker rm -f "$CONTAINER" 2>/dev/null || true
        exit 1
    }
    trap 'docker rm -f "$CONTAINER" 2>/dev/null || true' EXIT

    echo "==> Building $TAG …"
    docker build -t "$TAG" .

    echo "==> Starting container …"
    docker run -d --name "$CONTAINER" -p 5001:5001 "$TAG"

    echo "==> Waiting for server …"
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 http://localhost:5001/sign-in > /dev/null 2>&1; then
            echo "Server ready (attempt $i)"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "ERROR: server did not start within 30s"
            fail
        fi
        sleep 1
    done

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:5001/sign-in || echo "curl_error_$?")
    if [[ "$HTTP_CODE" =~ ^[0-9]+$ ]] && [ "$HTTP_CODE" -lt 500 ]; then
        echo "PASS — /sign-in returned $HTTP_CODE"
    else
        echo "FAIL — /sign-in returned '$HTTP_CODE' (expected HTTP < 500)"
        fail
    fi

# Same but skip the Docker build (use cached image)
smoke-test-fast:
    #!/usr/bin/env bash
    set -euo pipefail
    CONTAINER="test-container"

    fail() {
        echo "==> Container logs:"
        docker logs "$CONTAINER" 2>&1 || true
        docker rm -f "$CONTAINER" 2>/dev/null || true
        exit 1
    }
    trap 'docker rm -f "$CONTAINER" 2>/dev/null || true' EXIT

    echo "==> Starting container (cached image) …"
    docker run -d --name "$CONTAINER" -p 5001:5001 tucaken-app:ci-test

    echo "==> Waiting for server …"
    for i in $(seq 1 30); do
        if curl -sf --max-time 2 http://localhost:5001/sign-in > /dev/null 2>&1; then
            echo "Server ready (attempt $i)"
            break
        fi
        if [ "$i" -eq 30 ]; then
            echo "ERROR: server did not start within 30s"
            fail
        fi
        sleep 1
    done

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 http://localhost:5001/sign-in || echo "curl_error_$?")
    if [[ "$HTTP_CODE" =~ ^[0-9]+$ ]] && [ "$HTTP_CODE" -lt 500 ]; then
        echo "PASS — /sign-in returned $HTTP_CODE"
    else
        echo "FAIL — /sign-in returned '$HTTP_CODE' (expected HTTP < 500)"
        fail
    fi

# ── Test User ─────────────────────────────────────────────────────────────────

# Create a role=user test account in Cognito (run once; credentials saved to .env.local)
create-test-user:
    npx tsx scripts/create-test-user.ts

# Delete test user from Cognito so sign-up can be tested end-to-end via the UI
reset-test-user:
    npx tsx scripts/reset-test-user.ts

# ── AWS / Cognito Setup ───────────────────────────────────────────────────────

# Configure Google + GitHub sign-in in Cognito (interactive, uses dev-account profile)
setup-cognito:
    yarn setup:cognito

# Same but pass explicit region and pool id
setup-cognito-explicit region pool_id:
    npx tsx scripts/setup-cognito-providers.ts --region {{region}} --pool-id {{pool_id}}

# Enable ALLOW_USER_PASSWORD_AUTH on the Cognito App Client (required for email/password sign-in)
enable-password-auth:
    npx tsx scripts/enable-password-auth.ts

# Add production domain to Cognito App Client callback + logout URL allowlist
update-cognito-prod:
    yarn update:cognito-prod

# Pass explicit app URL (e.g. just update-cognito-prod-url https://tucaken.io)
update-cognito-prod-url app_url:
    npx tsx scripts/update-cognito-prod.ts --app-url {{app_url}}

# Same but skip discovery prompts
update-cognito-prod-explicit region pool_id client_id:
    npx tsx scripts/update-cognito-prod.ts --region {{region}} --pool-id {{pool_id}} --client-id {{client_id}}
