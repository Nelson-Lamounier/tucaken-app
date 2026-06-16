---
title: Accept Cognito's AWS-managed password-reset code TTL
type: decision
tags: [cognito, authentication, security, aws, password-reset]
sources:
  - src/server/auth.ts
created: 2026-05-16
updated: 2026-06-16
---

## Status

Accepted — 2026-05-16. Risk-accepted deviation from a 30-minute target.

## Context

A security target called for password-reset links/codes to expire after 30
minutes. Authentication is AWS Cognito, and the forgot-password confirmation-code
TTL is AWS-managed: it is **not exposed** by any CDK/CloudFormation/API parameter
(there is no `CodeExpirationMinutes`; a Lambda trigger can rewrite the email body
but cannot shorten code validity). The literal 30-minute target is therefore
unreachable without replacing the managed reset flow. The other two reset
controls already pass: tokens are single-use and invalidated immediately (Cognito
native), and expired/used tokens return generic, non-enumerable errors
([src/server/auth.ts](../../src/server/auth.ts) + `ForgotPasswordForm.tsx`).

## Decision

Accept Cognito's AWS-enforced confirmation-code window rather than build a custom
reset system to hit the exact 30-minute figure.

## Consequences

The reset-code lifetime stays at AWS's managed default, slightly longer than the
30-minute target — an accepted residual risk, bounded by the single-use and
non-enumerable-error controls that remain in force. The app avoids owning a
custom credential-reset path (its own token table plus an `AdminSetUserPassword`
IAM privilege), which would add a credential-reset attack surface and operational
burden. Revisit only if a hard external or compliance mandate makes 30 minutes
non-negotiable, in which case implement the custom flow under TDD with an
`AdminSetUserPassword` privilege review.

## Alternatives considered

- **Custom token system** (own table + `AdminSetUserPassword`) to enforce an
  arbitrary TTL — rejected: adds a credential-reset attack surface and
  operational ownership disproportionate to the residual risk.
- **Lambda trigger to shorten validity** — rejected: triggers can rewrite the
  email but cannot change AWS-enforced code validity.

<!--
Evidence trail (auto-generated):
- Source: production-deployment-check-list.md §2 (2026-05-16 risk-accepted deviation note),
  migrated into this ADR on 2026-06-16
- Source: src/server/auth.ts (forgot-password generic error handling, per the original note)
-->
