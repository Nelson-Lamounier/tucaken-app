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

# Same but skip discovery prompts
update-cognito-prod-explicit region pool_id client_id:
    npx tsx scripts/update-cognito-prod.ts --region {{region}} --pool-id {{pool_id}} --client-id {{client_id}}
