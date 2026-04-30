---
name: pre-deploy-checklist
description: Pre-deploy gate for Tucaken. Verifies CI jobs (lint, typecheck, test, build, docker-build) are green, ADMIN_API_URL and VITE_* env vars are wired correctly, ArgoCD sync is confirmed, Argo Rollouts promoted to Healthy, and CloudFront /admin/* invalidated.
type: lifecycle
library: tucaken-app
library_version: initial-development
sources:
  - .github/workflows/ci.yml
  - .github/workflows/deploy.yml
requires:
  - security-review
  - verify-endpoint-connectivity
---

# Tucaken — Pre-Deploy Checklist

Run through every section before merging to `main`. Deploying with any item unresolved risks broken deployments, stale caches, or runtime failures.

---

## CI Pipeline

All jobs in `.github/workflows/ci.yml` must be **green** before deploy. A `ci-success` gate job enforces this — do not merge if it is pending or failed.

| Job | Command | Pass condition |
|---|---|---|
| `setup` | resolves Node from `.nvmrc` | Node version pinned |
| `audit` | `yarn npm audit --all --severity high` | Zero high/critical vulnerabilities |
| `lint` | `yarn lint` | Zero lint errors |
| `typecheck` | `yarn typecheck` | Zero type errors |
| `test` | `yarn test` (Vitest, node env) | All tests pass |
| `build` | `yarn build` | `dist/server/server.js` exists |
| `docker-build` | Docker build + smoke test | `/admin/` returns HTTP < 500 |

**How to check locally before pushing:**
```bash
yarn lint && yarn typecheck && yarn test && yarn build
```

### Check: `docker-build` smoke test passes

```bash
docker build -t tucaken-app:local .
docker run -d -p 5001:5001 tucaken-app:local
curl -sf http://localhost:5001/admin/   # must return HTTP < 500
```

---

## Environment Variables

### Server-side (`process.env` — NOT in browser bundle)

| Variable | Expected value | How to check |
|---|---|---|
| `ADMIN_API_URL` | `http://admin-api.admin-api:3002` | K8s deployment manifest in cdk-monitoring repo |
| `AWS_REGION` | `eu-west-1` | K8s deployment manifest |

**How to check:**
```bash
# Inspect running pod environment (requires cluster access via cdk-monitoring)
kubectl exec -n start-admin deploy/start-admin -- env | grep ADMIN_API_URL
```

### Client-side (`VITE_` prefix — inlined into browser bundle at build time)

| Variable | Expected value | Set in |
|---|---|---|
| `VITE_GITHUB_APP_SLUG` | `tucaken-admin` | Docker build args / K8s configmap |
| `VITE_ADMIN_BASE_PATH` | `/admin` | Docker build args (deploy.yml hardcodes this) |

### CI/CD secrets (GitHub Actions environment secrets)

| Secret | Purpose |
|---|---|
| `AWS_OIDC_ROLE` | OIDC role for ECR push and SSM read/write access |

---

## Deploy Pipeline

Triggered automatically by push to `main` (`.github/workflows/deploy.yml`). Steps run in order — verify each has succeeded in the GitHub Actions run.

### Step 1 — Docker image built and pushed to ECR

- Vite + esbuild build runs with `NODE_ENV=production` and `VITE_ADMIN_BASE_PATH=/admin`
- Image URI pushed to ECR (repository URL pulled from SSM: `/shared/ecr-admin/${ENVIRONMENT}/repository-uri`)
- Image URI written to SSM: `/start-admin/${ENVIRONMENT}/image-uri`

**How to check:**
```bash
# Verify SSM parameter updated (requires AWS CLI with OIDC role)
aws ssm get-parameter --name "/start-admin/production/image-uri" --query Parameter.Value --output text
```

### Step 2 — ArgoCD sync confirmed

ArgoCD polls the new image URI from SSM and updates the rollout spec. The deploy pipeline waits up to **5 minutes** for the pod spec image to reflect the new tag.

**How to check:**
```bash
kubectl argo rollouts get rollout start-admin -n start-admin
# Verify: spec.template image shows new tag
```

### Step 3 — Argo Rollouts promoted to Healthy

Argo Rollouts pauses at canary weight before full promotion. The pipeline promotes via SSM command on the control-plane EC2 instance, then waits for status `Healthy`.

**How to check:**
```bash
kubectl argo rollouts get rollout start-admin -n start-admin
# Status must be: Healthy
# If stuck at Paused: promote was not triggered — check deploy.yml SSM run-command step
```

### Step 4 — CloudFront `/admin/*` invalidation created

The distribution ID is pulled from SSM: `/nextjs/${ENVIRONMENT}/cloudfront/distribution-id`. Invalidation is automated in `deploy.yml` but will fail silently if the SSM parameter is missing.

**How to check:**
```bash
# Confirm invalidation was created (check deploy.yml logs for CreateInvalidation step)
# Or verify via AWS Console: CloudFront → Distributions → Invalidations tab
```

---

## Common Mistakes

### HIGH: Merging before all CI jobs pass

- Mechanism: `ci-success` job gates on lint, typecheck, test, and build — all must pass; `docker-build` can be skipped only if `build` itself fails
- Always wait for the **full** CI run, not just the first few jobs
- Merging while `audit` or `docker-build` is still running is a deploy risk

### HIGH: Missing `ADMIN_API_URL` in Kubernetes deployment

- Mechanism: If `ADMIN_API_URL` is absent, server functions fall back to `http://admin-api.admin-api:3002` — this default will not resolve if the namespace has changed
- Check the K8s deployment manifest in the cdk-monitoring repo before every deploy that touches namespacing or infra

### HIGH: CloudFront invalidation not created

- Mechanism: Old cached assets are served to users even after the new container is running
- Invalidation is automated in `deploy.yml` but fails if `/nextjs/${ENVIRONMENT}/cloudfront/distribution-id` SSM parameter is missing or misconfigured
- Verify the invalidation appears in the CloudFront console after each deploy

---

## Pre-Deploy Summary

- [ ] All CI jobs green: `audit`, `lint`, `typecheck`, `test`, `build`, `docker-build`
- [ ] `ADMIN_API_URL` set correctly in K8s environment (check cdk-monitoring repo)
- [ ] `VITE_GITHUB_APP_SLUG` and `VITE_ADMIN_BASE_PATH` set in Docker build args
- [ ] Docker smoke test passes: `/admin/` returns HTTP < 500
- [ ] ArgoCD sync confirmed — new image tag visible in rollout spec
- [ ] Argo Rollouts promoted and status is `Healthy`
- [ ] CloudFront `/admin/*` invalidation created
