---
title: FinOps /costs returns zero despite real Bedrock spend
type: troubleshooting
tags: [finops, aws-cost-explorer, bedrock, cost-allocation-tags, iam, eks-pod-identity, observability]
sources:
  - admin-api/src/routes/finops.ts
  - admin-api/src/index.ts
created: 2026-06-16
updated: 2026-06-16
---

## Symptom

The admin dashboard Cost tab shows no Bedrock cost. `GET /costs` returns an empty
`costs` array — its Cost Explorer call fails and the route's `try/catch` swallows
the error, so it presents as empty rather than a 500
([finops.ts](../../admin-api/src/routes/finops.ts#L227-L231)). The sibling metric
routes (`GET /realtime`, `/chatbot`, `/self-healing`) have no such `try/catch`, so
under the same condition they fail with a 500 instead of returning empty.

## Root cause

There are **two independent causes**, both confirmed read-only against the dev
account (`771826808455`) on 2026-06-16.

### Cause A (primary) — the pod's IAM role cannot call Cost Explorer or CloudWatch

admin-api runs under **EKS Pod Identity**, not an EC2 instance profile: the
service account `admin-api` is mapped to the role
`EksPodIdentity-development-Roleadminapi…`
([verified via `aws eks list-pod-identity-associations` + `describe-pod-identity-association` on 2026-06-16]).
That role's only actions are `cognito-idp:AdminDeleteUser/DisableUser/EnableUser`
and `s3:GetObject/PutObject/DeleteObject/ListBucket` — **no `ce:` and no
`cloudwatch:` actions**
([verified via `aws iam get-role-policy` on 2026-06-16]). So `GetCostAndUsage`
returns AccessDenied → caught → empty `costs`, and `GetMetricData` would be denied
for the metric routes. No tag fix can help until this is granted.

> Note: `admin-api/src/index.ts`'s comment "AWS credentials come from EC2 Instance
> Profile (IMDS)" is **stale** — the pod uses EKS Pod Identity (the node instance
> profile does carry `BedrockInvokeModel`, but the pod does not use it).

### Cause B (secondary) — even with perms, the tag filter matches no spend

`GET /costs` filters Cost Explorer by the `Project=bedrock` cost-allocation tag and
groups by `aws:bedrock:inference-profile`
([finops.ts](../../admin-api/src/routes/finops.ts#L214-L226)). Both tags are empty
on the actual spend, and the actual spend is not the Claude pipelines:

- Bedrock is billed ~$0.35 (2026-05-17→06-01) and ~$0.42 (06-01→06-16); grouped by
  `Project` and by `aws:bedrock:inference-profile` it returns a single empty-value
  group (`Project$`, `aws:bedrock:inference-profile$`) — untagged.
- By `USAGE_TYPE` the spend is `EU-TitanEmbeddingV2-Text-input-tokens` ($0.345,
  ingestion embedder) + `USW2-AmazonRerank-v1-searchunits` ($0.071) — **direct
  `InvokeModel`/`Rerank`, not via an application inference profile**, so they
  cannot carry the `aws:bedrock:inference-profile` tag the route groups on. No
  Claude/Converse usage-type appears, matching the empty `BedrockMultiAgent`
  CloudWatch namespace.
- Five Claude application inference profiles exist (`bedrock-dev-strategist-sonnet`,
  `-article-sonnet`, `-haiku`, …) — these *can* be tagged — but Claude spend was
  ~zero in the window, so even tagging them would not surface today's cost.
  ([all verified via `aws ce get-cost-and-usage` group-bys + `aws bedrock list-inference-profiles` on 2026-06-16]).

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

For cause A, confirm the pod's role and its (missing) perms:

```bash
# Which role does the admin-api pod assume? (Pod Identity, not instance profile)
aws eks list-pod-identity-associations --cluster-name <cluster> --region <region> \
  --query "associations[?serviceAccount=='admin-api']"
# Inspect that role's actions — look for ce:/cloudwatch: (expect absent)
aws iam get-role-policy --role-name <role> --policy-name <policy> \
  --query 'PolicyDocument.Statement[].Action'
```

## How to fix

Fix in this order — perms first, since nothing else matters until the pod can read
AWS:

1. **Grant the Pod Identity role the read perms (cause A).** In the infra repo
   (`tucaken-infra`, GitHub `Nelson-Lamounier/cdk-monitoring`), the `case
   'admin-api':` block of `infra/lib/stacks/kubernetes/eks-pod-identity-stack.ts`
   defines this role. Add a statement granting `ce:GetCostAndUsage`, `ce:GetTags`,
   and `cloudwatch:GetMetricData` / `cloudwatch:ListMetrics` (an existing block in
   the same stack already grants the CloudWatch actions for another service
   account — reuse that pattern). Deploy the stack.
2. **Make the metric routes fail soft.** Wrap `/realtime`, `/chatbot`,
   `/self-healing` in the same `try/catch`-to-empty pattern `/costs` uses
   ([finops.ts](../../admin-api/src/routes/finops.ts#L227-L231)) so a missing
   metric or perm degrades to empty instead of 500.
3. **Fix attribution (cause B).** Activate `Project` as a cost-allocation tag in
   the Billing console (applies forward only), tag the Claude application inference
   profiles `Project=bedrock`, and confirm workers invoke via the
   application-inference-profile ARNs (not raw `eu.anthropic.*` system ids) so the
   tag attaches to cost. Titan embeddings and Rerank are direct `InvokeModel` and
   cannot carry that tag — attribute those via the application-level
   `prompt_invocations` table instead (see related concept).
4. **Make the route honest.** Until tags are populated, have `/costs` filter by
   `Dimensions: SERVICE = "Amazon Bedrock"` and additionally group by `USAGE_TYPE`
   (which **is** populated) so it shows real spend, or return an explicit
   "cost-allocation tags not active" state rather than a silent empty array
   ([finops.ts](../../admin-api/src/routes/finops.ts#L220-L224)).

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
- Source: admin-api/src/index.ts (credential-model comment, now known stale)
- Live: aws eks list-pod-identity-associations / describe-pod-identity-association (dev-account, eu-west-1, 2026-06-16)
  → admin-api SA → role EksPodIdentity-development-Roleadminapi5EAE4B6E-gYZToUb4xsCc
- Live: aws iam get-role-policy (that role, 2026-06-16) → cognito-idp:Admin{Delete,Disable,Enable}User + s3:{Get,Put,Delete}Object/ListBucket; NO ce:/cloudwatch:
- Live: aws ce get-cost-and-usage SERVICE="Amazon Bedrock" (dev-account, 2026-06-16) → $0.346 / $0.416
- Live: aws ce get-cost-and-usage group-by TAG Project + aws:bedrock:inference-profile (2026-06-16) → empty-value keys
- Live: aws ce get-cost-and-usage group-by USAGE_TYPE (2026-06-16) → TitanEmbeddingV2 $0.345 + AmazonRerank $0.071
- Live: aws ce get-tags --tag-key Project (2026-06-16) → [""]
- Live: aws bedrock list-inference-profiles --type-equals APPLICATION (eu-west-1, 2026-06-16) → 5 profiles (bedrock-dev-*)
- Live: aws cloudwatch get-metric-data BedrockMultiAgent (eu-west-1, 2026-06-16) → no datapoints (7d)
-->
