# Migrate admin-api to tucaken-app Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `admin-api` from `cdk-monitoring/api/admin-api/` into `tucaken-app/admin-api/` as a Yarn workspace package, migrate the deploy workflow and ARC runner, and remove the old code from cdk-monitoring.

**Architecture:** tucaken-app becomes a Yarn v4 workspace monorepo with two packages — the existing frontend root and the new `admin-api/` workspace. The Dockerfile build context stays at the repo root (same pattern as cdk-monitoring). The `deploy-admin-api.yml` workflow replaces `deploy-api.yml` in cdk-monitoring, running on the existing `k8s-runner` (tucaken-app's ARC runner), which will need its RBAC extended in kubernetes-bootstrap to cover the `admin-api` namespace.

**Tech Stack:** Yarn v4 workspaces, TypeScript, Hono, Docker multi-stage build, GitHub Actions, Argo Rollouts, kubectl, GHCR

---

## File Map

### Created in tucaken-app
| File | Purpose |
|------|---------|
| `admin-api/` | Entire admin-api source tree, copied from cdk-monitoring |
| `tsconfig.base.json` | Shared TS base config (admin-api's tsconfig.json extends it) |
| `admin-api/tsconfig.json` | Updated: `extends` path changes from `../../` to `../` |
| `admin-api/jest.config.js` | Updated: inline esmConfig instead of importing from cdk-monitoring root |
| `admin-api/Dockerfile` | Updated: 4 path refs change from `api/admin-api/` to `admin-api/` |
| `admin-api/docker-compose.yml` | Updated: context `../..` → `..`, dockerfile path updated |
| `admin-api/scripts/local-admin-api.sh` | Updated: REPO_ROOT depth changes (was 2 levels up from `api/admin-api/`, now 1 level up from `admin-api/`) |
| `.github/docker/arc-runner/Dockerfile` | Copied from cdk-monitoring |
| `.github/workflows/build-arc-runner.yml` | New: builds and pushes `ghcr.io/nelson-lamounier/tucaken-app/arc-runner:latest` |
| `.github/workflows/deploy-admin-api.yml` | Adapted from cdk-monitoring's `deploy-api.yml` (3 changes) |

### Modified in tucaken-app
| File | Change |
|------|--------|
| `package.json` | Add `"workspaces": ["admin-api"]` |

### Removed from cdk-monitoring (final task)
| Path | Notes |
|------|-------|
| `api/admin-api/` | Entire directory |
| `.github/workflows/deploy-api.yml` | Superseded by tucaken-app's `deploy-admin-api.yml` |
| `.github/docker/arc-runner/Dockerfile` | Now lives in tucaken-app |
| `build-ci-image.yml` arc-runner job | Remove job, keep CI image job |

### Updated in kubernetes-bootstrap (external repo)
| Change | Why |
|--------|-----|
| ARC runner image ref for `k8s-runner`: `ghcr.io/nelson-lamounier/cdk-monitoring/arc-runner:latest` → `ghcr.io/nelson-lamounier/tucaken-app/arc-runner:latest` | After image moves to tucaken-app GHCR |
| Add RoleBinding for `k8s-runner` service account in `admin-api` namespace | Promote job needs `get`/`list`/`watch`/`update` on `rollouts.argoproj.io` |

---

## Task 1: Establish workspace structure

**Files:**
- Modify: `tucaken-app/package.json`
- Create: `tucaken-app/tsconfig.base.json`

- [ ] **Step 1: Add workspaces field to package.json**

Open `tucaken-app/package.json` and add after the `"packageManager"` line:

```json
{
  "name": "tucaken-app",
  "private": true,
  "type": "module",
  "packageManager": "yarn@4.12.0",
  "workspaces": [
    "admin-api"
  ],
  "imports": {},
  "scripts": {
```

- [ ] **Step 2: Create tsconfig.base.json at tucaken-app root**

Create `tucaken-app/tsconfig.base.json` with this exact content (copied from cdk-monitoring root):

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "strictNullChecks": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add package.json tsconfig.base.json
git commit -m "chore: init admin-api yarn workspace at repo root"
```

---

## Task 2: Import admin-api with full git history

**Files:**
- Create: `tucaken-app/admin-api/` (grafted from cdk-monitoring with 85 commits preserved)

Uses `git filter-repo` to extract only commits that touched `api/admin-api/`, rewrites
the path to `admin-api/`, then grafts those commits into tucaken-app via a remote merge.

- [ ] **Step 1: Clone cdk-monitoring to a temp directory**

```bash
git clone --no-local \
  /Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring \
  /tmp/admin-api-history
```

`--no-local` forces a real copy rather than hardlinks so filter-repo can safely rewrite
the clone without touching the original repo.

- [ ] **Step 2: Filter to admin-api commits only, rename path**

```bash
cd /tmp/admin-api-history
git filter-repo \
  --path api/admin-api/ \
  --path-rename api/admin-api/:admin-api/ \
  --refs main \
  --force
```

Expected: the clone now contains only commits that touched `api/admin-api/`, with all
paths rewritten so `api/admin-api/src/index.ts` becomes `admin-api/src/index.ts`.
Verify:

```bash
git log --oneline | wc -l   # should be ~85
ls                          # should show admin-api/ at root
```

- [ ] **Step 3: Graft history into tucaken-app**

```bash
cd /Users/nelsonlamounier/Desktop/portfolio/tucaken-app
git remote add admin-api-history /tmp/admin-api-history
git fetch admin-api-history
git merge --allow-unrelated-histories admin-api-history/main \
  --no-edit -m "feat: import admin-api with full git history from cdk-monitoring"
```

Expected: merge commit created. `admin-api/` directory now exists in tucaken-app.

- [ ] **Step 4: Verify history is intact**

```bash
git log --oneline admin-api/ | head -10
git log --oneline --follow admin-api/src/index.ts | head -5
```

Expected: commits from cdk-monitoring visible with original messages and SHAs.

- [ ] **Step 5: Clean up temp remote and clone**

```bash
git remote remove admin-api-history
rm -rf /tmp/admin-api-history
```

- [ ] **Step 6: Verify directory contents**

```bash
ls admin-api/
```

Expected: `src/  __tests__/  Dockerfile  docker-compose.yml  jest.config.js  package.json  tsconfig.json  vitest.integration.config.ts  scripts/  .env.example`

---

## Task 3: Fix path references inside admin-api

**Files:**
- Modify: `tucaken-app/admin-api/tsconfig.json`
- Modify: `tucaken-app/admin-api/jest.config.js`
- Modify: `tucaken-app/admin-api/docker-compose.yml`
- Modify: `tucaken-app/admin-api/scripts/local-admin-api.sh`

- [ ] **Step 1: Fix tsconfig.json extends path**

In `admin-api/tsconfig.json`, change the `extends` field:

Old:
```json
{
  "extends": "../../tsconfig.base.json",
```

New:
```json
{
  "extends": "../tsconfig.base.json",
```

(File was at `cdk-monitoring/api/admin-api/` → 2 levels up. Now at `tucaken-app/admin-api/` → 1 level up.)

- [ ] **Step 2: Inline jest.config.js (remove cdk-monitoring root import)**

`admin-api/jest.config.js` currently imports `esmConfig` from `../../jest.config.base.mjs` — that file lives in cdk-monitoring root and won't exist in tucaken-app. Replace the entire file with the inlined config:

```js
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      useESM: true,
      tsconfig: './tsconfig.json',
    }],
  },
  roots: ['<rootDir>'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/cdk\\.out/',
    '/__tests__/integration/',
  ],
  clearMocks: true,
  resetModules: true,
};
```

- [ ] **Step 3: Fix docker-compose.yml build context and dockerfile path**

In `admin-api/docker-compose.yml`, update the `build` block:

Old:
```yaml
    build:
      context: ../..
      dockerfile: api/admin-api/Dockerfile
```

New:
```yaml
    build:
      context: ..
      dockerfile: admin-api/Dockerfile
```

(`context: ../..` was relative to `api/admin-api/` pointing at repo root. Now relative to `admin-api/`, one level up is the repo root.)

- [ ] **Step 4: Fix REPO_ROOT in local-admin-api.sh**

In `admin-api/scripts/local-admin-api.sh`, fix the REPO_ROOT line:

Old:
```bash
REPO_ROOT="$(cd "${ADMIN_API_DIR}/../.." && pwd)"
```

New:
```bash
REPO_ROOT="$(cd "${ADMIN_API_DIR}/.." && pwd)"
```

(Was 2 levels up from `api/admin-api/`. Now 1 level up from `admin-api/`.)

- [ ] **Step 5: Verify tsconfig path resolves**

```bash
cd admin-api
ls ../tsconfig.base.json
```

Expected: file exists.

- [ ] **Step 6: Commit**

```bash
git add admin-api/tsconfig.json admin-api/jest.config.js admin-api/docker-compose.yml admin-api/scripts/local-admin-api.sh
git commit -m "fix(admin-api): update path references for tucaken-app workspace layout"
```

---

## Task 4: Fix Dockerfile paths

**Files:**
- Modify: `tucaken-app/admin-api/Dockerfile`

The Dockerfile uses 4 path refs to `api/admin-api/` which must become `admin-api/`.

- [ ] **Step 1: Update all four COPY lines**

In `admin-api/Dockerfile`, make these replacements:

Old:
```dockerfile
COPY api/admin-api/package.json  api/admin-api/
COPY api/admin-api/tsconfig.json api/admin-api/
```

New:
```dockerfile
COPY admin-api/package.json  admin-api/
COPY admin-api/tsconfig.json admin-api/
```

Old:
```dockerfile
COPY api/admin-api/src api/admin-api/src/
RUN yarn workspace @repo/admin-api build
```

New (unchanged — workspace name `@repo/admin-api` stays the same):
```dockerfile
COPY admin-api/src admin-api/src/
RUN yarn workspace @repo/admin-api build
```

Old:
```dockerfile
COPY --from=builder --chown=adminapi:nodejs /app/api/admin-api/dist      ./dist/
COPY --from=builder --chown=adminapi:nodejs /app/node_modules            ./node_modules/
COPY --from=builder --chown=adminapi:nodejs /app/api/admin-api/package.json ./
```

New:
```dockerfile
COPY --from=builder --chown=adminapi:nodejs /app/admin-api/dist      ./dist/
COPY --from=builder --chown=adminapi:nodejs /app/node_modules        ./node_modules/
COPY --from=builder --chown=adminapi:nodejs /app/admin-api/package.json ./
```

- [ ] **Step 2: Verify no remaining api/admin-api refs**

```bash
grep -n "api/admin-api" admin-api/Dockerfile
```

Expected: no output.

- [ ] **Step 3: Run Docker build smoke test**

```bash
docker build \
  --platform linux/amd64 \
  --file admin-api/Dockerfile \
  --tag admin-api:local-test \
  .
```

Expected: Build completes with both stages (builder → runtime). Final image tagged `admin-api:local-test`.

- [ ] **Step 4: Commit**

```bash
git add admin-api/Dockerfile
git commit -m "fix(admin-api): update Dockerfile COPY paths for tucaken-app workspace layout"
```

---

## Task 5: Install dependencies and verify tests

**Files:**
- Modify: `tucaken-app/yarn.lock` (auto-updated)
- Modify: `tucaken-app/admin-api/node_modules/` (auto-created)

- [ ] **Step 1: Install workspace dependencies**

From the tucaken-app repo root:

```bash
yarn install
```

Expected: Yarn resolves and installs deps for both the root package and `admin-api`. The `admin-api/node_modules/` directory is created (or a single hoisted `node_modules/` depending on hoisting config).

- [ ] **Step 2: Typecheck admin-api**

```bash
yarn workspace @repo/admin-api typecheck
```

Expected: No TypeScript errors. If you see `Cannot find module '../../tsconfig.base.json'` — you missed the fix in Task 3 Step 1.

- [ ] **Step 3: Run admin-api unit tests**

```bash
yarn workspace @repo/admin-api test
```

Expected: All unit tests pass. Integration tests are excluded by `testPathIgnorePatterns`.

- [ ] **Step 4: Ensure frontend still works**

```bash
yarn typecheck
yarn test
```

Expected: Both pass — workspace install must not break the existing frontend package.

- [ ] **Step 5: Commit lockfile update**

```bash
git add yarn.lock
git commit -m "chore: yarn install after adding admin-api workspace"
```

---

## Task 6: Migrate deploy workflow

**Files:**
- Create: `tucaken-app/.github/workflows/deploy-admin-api.yml`

- [ ] **Step 1: Copy the workflow file**

```bash
cp /Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring/.github/workflows/deploy-api.yml \
   .github/workflows/deploy-admin-api.yml
```

- [ ] **Step 2: Apply the three required changes**

Open `.github/workflows/deploy-admin-api.yml` and make these three edits:

**Change 1 — paths trigger** (in the `on.push` block):

Old:
```yaml
    paths:
      - "api/**"
```

New:
```yaml
    paths:
      - "admin-api/**"
```

**Change 2 — Dockerfile path** (in the `build-admin-api` job, `Build Docker Image` step):

Old:
```yaml
          file: api/admin-api/Dockerfile
```

New:
```yaml
          file: admin-api/Dockerfile
```

**Change 3 — runner label** (in the `promote` job):

Old:
```yaml
    runs-on: k8s-runner-cdk
```

New:
```yaml
    runs-on: k8s-runner
```

- [ ] **Step 3: Verify no remaining cdk-monitoring-specific refs**

```bash
grep -n "api/admin-api\|k8s-runner-cdk" .github/workflows/deploy-admin-api.yml
```

Expected: no output.

- [ ] **Step 4: Verify local composite action refs resolve**

The workflow uses `./.github/actions/configure-aws` and `./.github/actions/loki-deploy-marker`. Confirm they exist:

```bash
ls .github/actions/configure-aws/action.yml
ls .github/actions/loki-deploy-marker/action.yml
```

Expected: both files exist (they were already in tucaken-app).

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-admin-api.yml
git commit -m "feat(ci): add deploy-admin-api workflow (migrated from cdk-monitoring)"
```

---

## Task 7: Add ARC runner Dockerfile and build workflow

**Files:**
- Create: `tucaken-app/.github/docker/arc-runner/Dockerfile`
- Create: `tucaken-app/.github/workflows/build-arc-runner.yml`

- [ ] **Step 1: Copy the ARC runner Dockerfile**

```bash
mkdir -p .github/docker/arc-runner
cp /Users/nelsonlamounier/Desktop/portfolio/cdk-monitoring/.github/docker/arc-runner/Dockerfile \
   .github/docker/arc-runner/Dockerfile
```

No changes needed — it's a generic image (AWS CLI + kubectl) with no repo-specific paths.

- [ ] **Step 2: Create build-arc-runner.yml**

Create `.github/workflows/build-arc-runner.yml`:

```yaml
# =============================================================================
# Build and Publish ARC Runner Image to GHCR
# =============================================================================
#
# Triggers when the arc-runner Dockerfile changes or via manual dispatch.
# Publishes to: ghcr.io/nelson-lamounier/tucaken-app/arc-runner:latest
#
# After publishing, update kubernetes-bootstrap arc-runners.yaml to reference
# the new image tag for the k8s-runner registered to nelson-lamounier/tucaken-app.
# =============================================================================

name: Build ARC Runner Image

on:
  push:
    paths:
      - ".github/docker/arc-runner/**"
    branches:
      - main
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  build-arc-runner:
    name: Build & Push ARC Runner Image
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout
        uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@4d04d5d9486b7bd6fa91e7baf45bbb4f8b9deedd # v4.0.0

      - name: Login to GHCR
        uses: docker/login-action@4907a6ddec9925e35a0a9e82d7399ccc52663121 # v4.1.0
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Generate Image Metadata
        id: meta
        run: |
          REPO_LOWER=$(echo "${{ github.repository }}" | tr '[:upper:]' '[:lower:]')
          IMAGE="ghcr.io/${REPO_LOWER}/arc-runner"
          SHORT_SHA="${GITHUB_SHA::7}"
          echo "image=${IMAGE}" >> $GITHUB_OUTPUT
          echo "tags=${IMAGE}:latest,${IMAGE}:${SHORT_SHA}" >> $GITHUB_OUTPUT

      - name: Build and Push
        uses: docker/build-push-action@bcafcacb16a39f128d818304e6c9c0c18556b85f # v7.1.0
        with:
          context: .github/docker/arc-runner
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          provenance: false

      - name: Summary
        run: |
          echo "## ARC Runner Image Published" >> $GITHUB_STEP_SUMMARY
          echo "**Image:** \`${{ steps.meta.outputs.image }}\`" >> $GITHUB_STEP_SUMMARY
          echo "**Tags:** \`${{ steps.meta.outputs.tags }}\`" >> $GITHUB_STEP_SUMMARY
          echo "| Tool | Pre-installed |" >> $GITHUB_STEP_SUMMARY
          echo "|------|--------------|" >> $GITHUB_STEP_SUMMARY
          echo "| AWS CLI v2 | ✅ |" >> $GITHUB_STEP_SUMMARY
          echo "| python3 + pip + venv | ✅ |" >> $GITHUB_STEP_SUMMARY
          echo "| kubectl (latest stable) | ✅ |" >> $GITHUB_STEP_SUMMARY
```

- [ ] **Step 3: Commit**

```bash
git add .github/docker/arc-runner/Dockerfile .github/workflows/build-arc-runner.yml
git commit -m "feat(ci): add ARC runner Dockerfile and build workflow (migrated from cdk-monitoring)"
```

- [ ] **Step 4: Trigger manual build and confirm image published**

Push to main or run the workflow manually from GitHub Actions UI. After it completes:

```bash
# Verify image is visible in GHCR
# Navigate to: https://github.com/Nelson-Lamounier/tucaken-app/pkgs/container/tucaken-app%2Farc-runner
```

Expected: `arc-runner:latest` and `arc-runner:<sha>` packages visible under the tucaken-app repo.

---

## Task 8: Update kubernetes-bootstrap (external repo)

> This task is in the `kubernetes-bootstrap` repo, not tucaken-app.

The `k8s-runner` ARC runner pod is registered to `Nelson-Lamounier/tucaken-app`. After this migration, it needs:
1. Its image updated to the new GHCR path
2. A RoleBinding added in the `admin-api` namespace so the promote job can manage Argo Rollouts

- [ ] **Step 1: Update arc-runner image in kubernetes-bootstrap**

In `kubernetes-bootstrap`, find the Helm values or manifest that sets the `k8s-runner` pod image. Look for:

```bash
grep -r "cdk-monitoring/arc-runner\|arc-runner" . --include="*.yaml" --include="*.yml" -l
```

Update the image reference from:
```yaml
image: ghcr.io/nelson-lamounier/cdk-monitoring/arc-runner:latest
```
To:
```yaml
image: ghcr.io/nelson-lamounier/tucaken-app/arc-runner:latest
```

Only update the `k8s-runner` entry (registered to tucaken-app). Leave any `k8s-runner-cdk` entry pointing at the cdk-monitoring image.

- [ ] **Step 2: Add RoleBinding for k8s-runner in admin-api namespace**

Create or extend a manifest in kubernetes-bootstrap that adds RBAC for the `k8s-runner` service account in the `admin-api` namespace. The promote job needs these verbs on `rollouts.argoproj.io`:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: arc-runner-admin-api
  namespace: admin-api
rules:
  - apiGroups: ["argoproj.io"]
    resources: ["rollouts"]
    verbs: ["get", "list", "watch", "update", "patch"]
  - apiGroups: ["argoproj.io"]
    resources: ["analysisruns"]
    verbs: ["get", "list", "watch"]
  - apiGroups: [""]
    resources: ["pods", "pods/log", "events"]
    verbs: ["get", "list", "watch"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: arc-runner-admin-api
  namespace: admin-api
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: arc-runner-admin-api
subjects:
  - kind: ServiceAccount
    name: <k8s-runner-service-account-name>   # match what the k8s-runner pod uses
    namespace: arc-runners                     # namespace where the runner pod lives
```

Replace `<k8s-runner-service-account-name>` with the actual service account name from the runner pod spec.

- [ ] **Step 3: Apply changes and verify runner can access admin-api namespace**

After ArgoCD reconciles kubernetes-bootstrap:

```bash
# From inside the cluster (or via k8s-runner pod exec):
kubectl auth can-i get rollouts --namespace admin-api \
  --as=system:serviceaccount:arc-runners:<k8s-runner-sa-name>
```

Expected: `yes`

- [ ] **Step 4: Commit kubernetes-bootstrap changes**

```bash
git add <changed-files>
git commit -m "feat(rbac): extend k8s-runner permissions to admin-api namespace for Argo Rollouts promote"
```

---

## Task 9: End-to-end smoke test

- [ ] **Step 1: Trigger deploy-admin-api workflow via workflow_dispatch**

From GitHub Actions UI → `deploy-admin-api.yml` → Run workflow → use default `ref: main`.

This tests the full path: resolve-ref → build → push → promote → deploy-marker.

- [ ] **Step 2: Watch the promote job**

The `promote` job runs on `k8s-runner`. Watch for:
- `Set up in-cluster kubeconfig` — passes (runner is inside cluster)
- `Verify Prometheus is reachable` — passes
- `Wait for ArgoCD sync` — passes once Image Updater picks up the new tag
- `Wait for pre-promotion pause and promote` — passes (Rollout enters Paused, promote issued)
- `Watch rollout to Healthy` — passes

- [ ] **Step 3: Confirm image tag in cluster**

After workflow completes, verify the deployed image tag:

```bash
kubectl get rollout admin-api -n admin-api \
  -o jsonpath='{.spec.template.spec.containers[0].image}'
```

Expected: image URL contains the SHA from the workflow run.

- [ ] **Step 4: Check Loki for deploy marker**

In Grafana, query:
```logql
{job="github-actions", service="admin-api"} |~ "deploy_succeeded"
```

Expected: one log line for the deploy with the correct git SHA.

---

## Task 10: Remove admin-api from cdk-monitoring

> Only do this after Task 9 succeeds end-to-end.

- [ ] **Step 1: Delete api/admin-api from cdk-monitoring**

In the `cdk-monitoring` repo:

```bash
rm -rf api/admin-api
```

Update `cdk-monitoring/package.json` to remove `"api/admin-api"` from the workspaces array.

- [ ] **Step 2: Remove deploy-api.yml from cdk-monitoring**

```bash
rm .github/workflows/deploy-api.yml
```

- [ ] **Step 3: Remove arc-runner Dockerfile from cdk-monitoring**

The `build-ci-image.yml` in cdk-monitoring has a `build-arc-runner` job. Remove that job — keep the `build-and-push` (CI image) job. Also remove the file:

```bash
rm .github/docker/arc-runner/Dockerfile
```

- [ ] **Step 4: Run yarn install in cdk-monitoring to clean up lockfile**

```bash
yarn install
```

Expected: lockfile updated, no reference to `@repo/admin-api`.

- [ ] **Step 5: Verify cdk-monitoring CI still passes**

```bash
yarn typecheck
yarn test
```

- [ ] **Step 6: Commit cdk-monitoring cleanup**

```bash
git add -A
git commit -m "chore: remove admin-api (migrated to tucaken-app)"
```
