---
title: Validate every server boundary before trusting it
type: pattern
tags: [zod, validation, security, input-validation, api]
sources:
  - src/server/applications.ts
  - src/server/articles.ts
  - admin-api/src/routes/internal-billing.ts
  - admin-api/src/routes/bedrock-usage.ts
  - admin-api/src/routes/drafts.ts
created: 2026-06-16
updated: 2026-06-16
---

## Intent

Treat every point where untrusted data crosses into server code — a TanStack
`createServerFn` input, a route loader's params, an `admin-api` Hono route's
JSON body or query/path params — as a boundary that must be validated before
the value is used. The aim is that no handler logic ever runs against an
unverified shape: a request with a missing field, a wrong type, or an
out-of-range value is rejected at the edge of the function rather than blowing
up (or silently misbehaving) deeper in a repository call or downstream fetch.

This is the application-tier half of a defence-in-depth posture. It does not
replace the database-tier guarantees described in
[repository-layer-rls.md](./repository-layer-rls.md) — RLS still enforces
per-tenant isolation even if a validator is forgotten — nor the authentication
checks in [cognito-jwks-verification.md](../concepts/cognito-jwks-verification.md).
Validation answers "is this payload well-formed?"; those answer "is this row
mine?" and "is this caller who they claim to be?".

## When to apply

Apply at any inbound server boundary that receives caller-controlled data:

- A TanStack `createServerFn` that accepts a `data` argument.
- A Hono route handler that reads `ctx.req.json()`, `ctx.req.query(...)`, or
  `ctx.req.param(...)`.
- Anywhere a value is about to be interpolated into a path, forwarded to
  `admin-api`, or passed to a repository.

Do not skip validation for "internal" or service-to-service routes. The
`admin-api/src/routes/internal-billing.ts` router is reached only with a Cognito
M2M token, yet it still Zod-validates every body — a client must never be able
to set its own Stripe customer ID (see the router's header comment, lines
9-14).

## Structure

There are two validation styles in this codebase, chosen by tier:

1. **Schema-first (Zod).** Declare a schema next to the handler, then run the
   incoming value through it before any logic. On the frontend this is wired
   declaratively via TanStack's `inputValidator`; in `admin-api` it is an
   explicit `schema.safeParse(...)` returning a 400 on failure.
2. **Manual guards.** A sequence of early-return checks (`typeof`, a regex, a
   range test) that each `return ctx.json({ error }, 400)` on the first failure,
   keeping the happy path flat and unindented.

Both styles share the contract: reject invalid input immediately with a 400
(or 503 where a dependency is unconfigured), and only reach business logic once
the value's shape is known.

## Implementation in this codebase

### tucaken-app server fns — Zod via `inputValidator`

The frontend uses Zod uniformly. Eighteen modules under `src/server/` register
schemas on `createServerFn().inputValidator(...)`, so the value handed to
`.handler({ data })` is already parsed and typed. In
`src/server/applications.ts` the schemas are declared in a dedicated block
(lines 31-41) and attached per function:

```ts
const slugSchema = z.string().min(1, 'Application slug is required')

export const getApplicationDetailFn = createServerFn({ method: 'GET' })
  .inputValidator(slugSchema)
  .handler(async ({ data: slug }) => {
    await requireAuth()
    const body = await apiFetch<{ application: ApplicationDetail }>(
      `/applications/${encodeURIComponent(slug)}`,
      { pathTemplate: '/applications/:slug' },
    )
    return body.application
  })
```

Note the ordering visible across that file: validation is declarative
(`inputValidator`), then `requireAuth()` runs as a fast-path guard inside the
handler, then the validated value is `encodeURIComponent`-escaped before being
placed in the forwarded path (lines 87-96, 104-114). The module header
(lines 9-13) is explicit that `requireAuth()` is only an edge fast-path —
`admin-api` re-verifies the forwarded JWT — which is the same defence-in-depth
logic applied to authn that validation applies to payload shape.

Schemas range from a single primitive (`slugSchema`) to composite objects with
enums and optional fields (`updateStatusSchema`, lines 37-41; the
`status` enum on article metadata in `src/server/articles.ts`, line 99).

### admin-api Hono routes — mixed Zod and manual guards

`admin-api` validation is **not uniform**; the style differs by route, and both
are legitimate here. Be accurate about which is which.

**Zod (with a shared helper).** `admin-api/src/routes/internal-billing.ts`
declares Zod schemas (lines 33-57) and runs them through a local `parseBody`
helper that either returns the parsed data or a 400 `Response`
(lines 61-83):

```ts
async function parseBody<T extends ZodTypeAny>(
  ctx: Context,
  schema: T,
): Promise<z.infer<T> | Response> {
  let raw: unknown;
  try {
    raw = await ctx.req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return new Response(
      JSON.stringify({ error: 'Validation failed', issues: result.error.issues }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  return result.data;
}
```

The schemas encode real domain constraints: `z.string().startsWith('cus_')`
for a Stripe customer ID, `z.string().startsWith('sub_')` for a subscription
ID, `z.string().uuid()`, and `z.string().datetime({ offset: true })` for an
ISO timestamp (lines 33-57). Callers use the `instanceof Response` check to
short-circuit: `const parsed = await parseBody(...); if (parsed instanceof
Response) return parsed;` (lines 101-103).

**Manual guards.** `admin-api/src/routes/bedrock-usage.ts` validates without
Zod. The `GET /summary` handler regex-checks the optional `userId` (a UUID
pattern) and `month` (`YYYY-MM`) query params, returning 400 on mismatch
(lines 32-41). The `PUT /budget/:userId` handler parses the body inside a
`try/catch` (400 on bad JSON), then applies explicit `typeof` + integer +
range checks per field — `monthlyLimitCents` must be an integer 0–100 000 and
`alertThresholdPct` an integer 1–100 — each as its own early-return 400
(lines 65-92).

`admin-api/src/routes/drafts.ts` likewise guards manually: the `:slug` path
param is validated against a slug regex
(`/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`, lines 38-40), the assets bucket
configuration is checked (503 if absent, lines 42-47), and the body `content`
must be a string of at least 20 trimmed characters (lines 49-54).

Across the wider `admin-api/src/routes/` tree the manual style dominates for
query/path params and many bodies — `Body must be valid JSON` 400s and
field-level guards recur in `applications.ts`, `github.ts`, `ingestion.ts`,
`articles.ts`, and `admin-users.ts`. Zod is reserved mainly for the
billing surface (`internal-billing.ts`). Treat the tier as "Zod where a body
has several typed fields, manual guards for single params and simple bodies",
not as universally Zod.

### Version note

The two packages pin different major versions of Zod: the tucaken-app root
declares `zod ^3.23.8` (`package.json`) while `admin-api` declares `zod ^4.4.3`
(`admin-api/package.json`). Schema authoring in `admin-api` should follow Zod 4
semantics; the frontend follows Zod 3.

## Variants

- **Declarative vs. imperative.** Frontend server fns get validation "for free"
  via `inputValidator`, so the handler body never references the raw input.
  Hono has no equivalent built-in hook in use here, so validation is an
  explicit first statement of the handler — either `parseBody(ctx, schema)` or
  a run of guard clauses.
- **Helper vs. inline.** Where several routes in one router share the
  parse-then-validate dance, it is factored into a `parseBody` helper that
  returns `data | Response` (`internal-billing.ts`). Single-route validation is
  written inline.
- **400 vs. 503.** A malformed payload is a client error (400); a missing
  server-side dependency (e.g. the assets bucket not configured in
  `drafts.ts`) is surfaced as 503, distinguishing "you sent bad input" from
  "the service cannot serve this right now".
- **Validate-then-escape.** Validation does not remove the need to escape:
  validated slugs are still passed through `encodeURIComponent` before being
  interpolated into forwarded paths (`applications.ts`), keeping the boundary
  safe even for shapes Zod accepts.

<!--
Evidence trail (verified 2026-06-16):
- src/server/applications.ts:16,31-41,53-64,86-96,104-114,124-138 — Zod schemas
  attached via .inputValidator(); requireAuth() fast-path; encodeURIComponent on
  validated slug; module header lines 9-13 on re-verification.
- git grep -l "inputValidator" -- src/server | wc -l => 18 files use inputValidator.
- src/server/articles.ts:85-104 — slug/content/metadata schemas inc. status enum.
- admin-api/src/routes/internal-billing.ts:9-14 (never user JWT),18,33-57 (Zod
  schemas: startsWith cus_/sub_, uuid, datetime offset),61-83 (parseBody helper
  safeParse -> 400 Response),100-103 (instanceof Response short-circuit).
- admin-api/src/routes/bedrock-usage.ts:32-45 (regex UUID + YYYY-MM query guards),
  65-92 (try/catch JSON + typeof/integer/range guards, 400 each).
- admin-api/src/routes/drafts.ts:35-54 (slug regex 38-40, 503 bucket check 42-47,
  content >=20 chars 49-54).
- git grep "400" -- admin-api/src/routes — "Body must be valid JSON" / field
  guards recur in applications.ts, github.ts, ingestion.ts, articles.ts,
  admin-users.ts; Zod only in internal-billing.ts. Mixed style confirmed.
- package.json:68 zod ^3.23.8 (root); admin-api/package.json:39 zod ^4.4.3.
- Cross-link targets exist: docs/patterns/repository-layer-rls.md,
  docs/concepts/cognito-jwks-verification.md.
-->
