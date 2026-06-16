---
title: FinOps /costs returns zero despite real Bedrock spend
type: troubleshooting
tags: [finops, aws-cost-explorer, bedrock, cost-allocation-tags, observability]
sources:
  - admin-api/src/routes/finops.ts
created: 2026-06-16
updated: 2026-06-16
---

## Symptom

The admin dashboard Cost tab shows no Bedrock cost — the `GET /costs` FinOps
route returns an empty `costs` array — even though Bedrock is being used and
billed. The route does not error; it simply returns nothing.

## Root cause

`GET /costs` queries Cost Explorer with a filter on the `Project=bedrock`
cost-allocation tag and a group-by on `aws:bedrock:inference-profile`
([finops.ts](../../admin-api/src/routes/finops.ts#L214-L226)). In the dev account
the Bedrock spend carries **no `Project` tag value**, so the filter matches
nothing. Verified read-only against the dev account on 2026-06-16:

- Bedrock is billed: `UnblendedCost` for service "Amazon Bedrock" was
  ~$0.346 (2026-05-17 to 06-01) and ~$0.416 (2026-06-01 to 06-16)
  ([verified via `aws ce get-cost-and-usage --filter SERVICE="Amazon Bedrock"` on 2026-06-16, profile dev-account]).
- The same spend grouped by the `Project` tag returns a single group keyed
  `Project$` (empty value) at $0.416 — i.e. untagged
  ([verified via `aws ce get-cost-and-usage ... --group-by Type=TAG,Key=Project` on 2026-06-16]).
- `Project` has no active non-empty cost-allocation tag value: `get-tags
  --tag-key Project` returns `[""]`
  ([verified via `aws ce get-tags --tag-key Project` on 2026-06-16]).

So the route's `Project=bedrock` filter is correct code against an account where
that cost-allocation tag was never populated/activated for Bedrock — the filter
excludes 100% of the actual spend.

## How to diagnose

Confirm the three facts above with read-only Cost Explorer calls (Cost Explorer is
global — always `us-east-1`):

```bash
# 1. Is Bedrock billed at all? (group by service, no tag filter)
aws ce get-cost-and-usage --profile <ro-profile> --region us-east-1 \
  --time-period Start=<start> End=<end> --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}'

# 2. What Project tag value does that spend carry? (empty = untagged)
aws ce get-cost-and-usage --profile <ro-profile> --region us-east-1 \
  --time-period Start=<start> End=<end> --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"SERVICE","Values":["Amazon Bedrock"]}}' \
  --group-by Type=TAG,Key=Project

# 3. Is the Project cost-allocation tag active with non-empty values?
aws ce get-tags --profile <ro-profile> --region us-east-1 \
  --time-period Start=<start> End=<end> --tag-key Project
```

A `Project$` group key (empty after the `$`) or a `[""]` tags result confirms the
tag is not populated.

## How to fix

Two independent options:

- **Tag the spend (preferred for attribution).** Activate `Project` as a
  cost-allocation tag in the Billing console and ensure Bedrock usage / the
  inference profiles are tagged `Project=bedrock`. Cost-allocation tags only apply
  going forward, so backfill is not retroactive.
- **Relax the route filter.** Drop or widen the `Project=bedrock` `Tags` filter in
  `GET /costs` ([finops.ts](../../admin-api/src/routes/finops.ts#L220-L224)) so the
  query reports Bedrock cost by `aws:bedrock:inference-profile` (the group-by the
  route already uses) without gating on the unpopulated `Project` tag. Filtering by
  `Dimensions: SERVICE = "Amazon Bedrock"` instead matches the real spend today.

## How to prevent

Treat cost-allocation tag activation as part of infrastructure provisioning (tag
Bedrock resources and activate the tag at stack-deploy time), and assert the
`/costs` route returns a non-empty result in an environment with known Bedrock
spend so a silent empty response is caught.

## Related observation

The `GET /realtime` route reads the `BedrockMultiAgent` CloudWatch namespace
([finops.ts](../../admin-api/src/routes/finops.ts#L119-L197)); that namespace
returned no datapoints for the last 7 days in dev
([verified via `aws cloudwatch get-metric-data` on 2026-06-16]). That is
consistent with low recent multi-agent activity rather than a confirmed defect —
distinct from the `/costs` tag gap above, which is a filter that cannot match.

## Related

- [Bedrock cost observability — estimated vs billed](../concepts/bedrock-cost-observability.md)
  — the two cost surfaces this route belongs to.

<!--
Evidence trail (auto-generated):
- Source: admin-api/src/routes/finops.ts (read on 2026-06-16, lines 119-232)
- Live: aws ce get-cost-and-usage SERVICE="Amazon Bedrock" (dev-account, 2026-06-16) → $0.346 / $0.416
- Live: aws ce get-cost-and-usage group-by TAG Project (dev-account, 2026-06-16) → key "Project$" (empty), $0.416
- Live: aws ce get-tags --tag-key Project (dev-account, 2026-06-16) → [""]
- Live: aws cloudwatch get-metric-data BedrockMultiAgent (dev-account, eu-west-1, 2026-06-16) → no datapoints (7d)
-->
