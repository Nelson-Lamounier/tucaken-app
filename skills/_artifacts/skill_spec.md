# Tucaken — Skill Spec

Tucaken is a SaaS application in initial development built on TanStack Start (SSR React),
TanStack Router, TanStack Query v5, Tailwind CSS v4, and Zustand. It exposes a BFF
(Backend For Frontend) layer via TanStack Start server functions that delegate all
business logic to a separate admin-api service running in Kubernetes.

## Domains

| Domain | Description | Skills |
|---|---|---|
| routing | File-based route structure, layout nesting, auth guards, nav wiring | add-route, router-architecture |
| data-fetching | TanStack Query hooks, adminKeys factory, polling, cache invalidation | add-query |
| server-functions | createServerFn BFF layer, requireAuth, apiFetch, Zod validation | add-server-function |
| feature-modules | Feature domain scaffold, reuse-first discipline, type/server separation | add-feature-domain, getting-started, ship-feature |
| ui-components | Shared component catalogue, reuse audit, composition patterns | component-reuse-audit |
| security | Auth guard, CSP, OWASP, input validation, secret isolation | security-review |
| performance | SSR safety, render efficiency, bundle, Motion for React | code-optimisation |
| deployment | K8s, ArgoCD, ECR, SSM, endpoint connectivity | verify-endpoint-connectivity, pre-deploy-checklist |
| maintainability | Duplication elimination, naming conventions, module restructuring | maintainability-review, restructure-module |

## Skill Inventory

| Skill | Type | Domain | What it covers | Failure modes |
|---|---|---|---|---|
| add-route | core | routing | createFileRoute, _dashboard prefix, validateSearch, DashboardPage, nav wiring | 3 |
| router-architecture | lifecycle | routing | Nested route groups, flat → nested migration, URL preservation | 1 |
| add-query | core | data-fetching | useQuery/useMutation, adminKeys, conditional polling, invalidation, toasts | 3 |
| add-server-function | core | server-functions | createServerFn, requireAuth, apiFetch, Zod, method selection, testing | 5 |
| add-feature-domain | core | feature-modules | Feature scaffold, type placement, server fn separation, TanStack Form, reuse-first | 3 |
| component-reuse-audit | core | ui-components | Component catalogue, Button variants, DashboardPage, LinkCard, Motion import | 2 |
| security-review | lifecycle | security | requireAuth, CSP, Zod validation, path encoding, VITE_ isolation, securityHeadersMiddleware scope | 4 |
| code-optimisation | lifecycle | performance | SSR safety, React 19 memoisation, lazy loading, Motion willChange | 2 |
| verify-endpoint-connectivity | core | deployment | ADMIN_API_URL, Bearer header, apiFetch error surface, live K8s cluster | 2 |
| pre-deploy-checklist | lifecycle | deployment | CI gates, ArgoCD promote, CloudFront invalidation, env var checklist | 1 |
| maintainability-review | lifecycle | maintainability | Structure drift, point-in-time fixes, Zustand scope, boundary violations | 3 |
| restructure-module | lifecycle | maintainability | @/ import updates, route path preservation, tsc + vitest after moves | 1 |
| getting-started | lifecycle | feature-modules | Yarn 4, path aliases, live K8s cluster (cdk-monitoring repo), BFF boundary | 0 |
| ship-feature | lifecycle | feature-modules | Reuse audit → tests → typecheck → lint → commit → CI → deploy | 0 |

## Failure Mode Inventory

### add-route (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Wrong file prefix — missing _dashboard. parent segment | CRITICAL | src/app/_dashboard.tsx | — |
| 2 | Forgetting to add navigation entry in AppLayout | HIGH | src/components/layouts/AppLayout.tsx | — |
| 3 | Using DashboardPage wrapper manually instead of component | HIGH | src/components/layouts/DashboardPage.tsx | — |

### add-query (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Adding query keys inline instead of extending adminKeys factory | CRITICAL | src/lib/api/query-keys.ts | — |
| 2 | Polling with fixed refetchInterval instead of conditional | HIGH | use-github-connected-repos.ts | — |
| 3 | Missing cache invalidation after mutation | HIGH | GitHubConnectedRepos.tsx | — |

### add-server-function (5 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Using method: 'GET' for mutation server functions | CRITICAL | src/server/github.ts | — |
| 2 | Omitting requireAuth() call inside handler | CRITICAL | src/server/auth-guard.ts | security-review |
| 3 | Using wrong import path alias — #/ instead of @/ | HIGH | vite.config.ts | — |
| 4 | Calling getCookie() outside server function handler context | HIGH | src/server/applications.ts | — |
| 5 | Silently ingesting admin-api 404 as data instead of null | HIGH | src/server/github.ts | — |

### security-review (4 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Missing requireAuth() on a new server function | CRITICAL | src/server/auth-guard.ts | add-server-function |
| 2 | URL-encoding omitted for user-supplied path segments | HIGH | src/server/github.ts | — |
| 3 | Exposing server-only env vars in VITE_ prefix | CRITICAL | src/server/applications.ts | — |
| 4 | Attaching securityHeadersMiddleware only to getUserSessionFn | HIGH | src/server/security-headers.ts | — |

### component-reuse-audit (2 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Creating new UI components that duplicate existing ones | HIGH | src/components/ui/ | add-feature-domain |
| 2 | Importing from 'framer-motion' instead of 'motion/react' | CRITICAL | .claude/rules/motion-react.md | code-optimisation |

### code-optimisation (2 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Accessing window/localStorage during SSR render | HIGH | src/app/__root.tsx | add-route |
| 2 | Importing Motion from framer-motion in a server component | HIGH | .claude/rules/motion-react.md | component-reuse-audit |

### verify-endpoint-connectivity (2 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Hardcoding admin-api URL instead of using env var | CRITICAL | src/server/applications.ts | add-server-function |
| 2 | Forgetting Authorization header in apiFetch override | HIGH | src/server/applications.ts | — |

### maintainability-review (3 failure modes)

| # | Mistake | Priority | Source | Cross-skill? |
|---|---|---|---|---|
| 1 | Storing server response data in Zustand | HIGH | src/lib/stores/ | add-query |
| 2 | Structure drift — files placed where convenient not where architecture requires | CRITICAL | maintainer interview | add-feature-domain |
| 3 | Point-in-time fix — solves immediate task without considering codebase lifecycle | HIGH | maintainer interview | ship-feature |

## Tensions

| Tension | Skills | Agent implication |
|---|---|---|
| SSR correctness vs client-only convenience | add-route ↔ code-optimisation | Agents add browser API calls at module level, crashing on server |
| BFF security vs development velocity | add-server-function ↔ security-review | Agents skip requireAuth() and Zod validation on new endpoints |
| Reuse-first vs create-first | component-reuse-audit ↔ add-feature-domain | Agents duplicate components, accelerating maintenance debt |
| Flat route convenience vs nested route scalability | router-architecture ↔ add-route | Agents deepen the flat structure instead of creating route groups |

## Cross-References

| From | To | Reason |
|---|---|---|
| add-server-function | add-query | Server fns + Query hooks are always paired; shared failure modes |
| add-route | component-reuse-audit | New routes need layout components — check catalogue first |
| ship-feature | security-review | Ship checklist includes a security gate |
| add-feature-domain | maintainability-review | New modules should be reviewed for duplication before merge |
| verify-endpoint-connectivity | add-server-function | Connectivity verification requires apiFetch + ADMIN_API_URL knowledge |
| router-architecture | add-route | Know the target structure before adding flat routes that need migration |

## Subsystems & Reference Candidates

| Skill | Subsystems | Reference candidates |
|---|---|---|
| add-server-function | — | adminKeys namespace patterns (dense factory) |
| component-reuse-audit | — | Full Button variant catalogue (6 variants + 5 sub-components) |
| security-review | — | CSP directive reference |

## Remaining Gaps

| Skill | Question | Status |
|---|---|---|
| security-review | CSRF/session fixation patterns in Cognito PKCE flow | open |
| router-architecture | Target nested directory structure for applications domain | open |
| getting-started | Local admin-api setup | resolved — live K8s cluster, repo: cdk-monitoring |
| add-feature-domain | TanStack Form as intended form pattern | resolved — confirmed by maintainer |

## Recommended Skill File Structure

- **Core skills:** add-route, add-query, add-server-function, add-feature-domain, component-reuse-audit, verify-endpoint-connectivity
- **Lifecycle skills:** ship-feature, getting-started, pre-deploy-checklist, security-review, code-optimisation, maintainability-review, restructure-module, router-architecture
- **Reference files:** add-server-function (adminKeys patterns), component-reuse-audit (Button variant catalogue), security-review (CSP directives)

## Composition Opportunities

| Library | Integration points | Composition skill needed? |
|---|---|---|
| TanStack Query | Pairs with every server function hook | No — covered by add-query + add-server-function |
| TanStack Form + Zod | Form validation in new features | No — covered by add-feature-domain |
| Motion for React | Animation in UI components | No — failure mode covered in component-reuse-audit |
| Headless UI v2 | Dialog, Menu, Tab primitives in new UI | No — covered by component-reuse-audit |
