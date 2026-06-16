---
title: Pre-deployment checklist
type: runbook
tags: [operations, deployment, security, pre-deploy]
sources:
  - src/server/auth.ts
created: 2026-05-16
updated: 2026-06-16
---

## Purpose

Use this checklist before every production deployment. Each item must be
explicitly verified — not assumed. Items below are generic release gates; the one
repo-specific architectural decision that lived here (the Cognito reset-code TTL)
has been promoted to [ADR 0007](../decisions/0007-accept-cognito-reset-code-ttl.md).

---

## 1. 🔐 Authentication & Authorization

- [ ] Users can only access data scoped to their own UUID — no cross-user data leakage possible
- [ ] All protected routes verify the authenticated user's identity before returning data
- [ ] Admin or privileged routes have role-based access controls enforced server-side

---

## 2. 🔑 Password Reset Flow

- [~] Password reset links expire after **30 minutes** — _risk-accepted deviation, see note_
- [x] Reset tokens are single-use and invalidated immediately after use _(Cognito-native)_
- [x] Expired or already-used tokens return a clear, safe error (no token enumeration) _(`src/server/auth.ts` + `ForgotPasswordForm.tsx` — generic errors)_

> **⚠️ Risk-accepted deviation — 30-minute expiry.**
> Auth is AWS Cognito. The forgot-password confirmation-code TTL is
> AWS-managed and **not exposed** by any CDK/CloudFormation/API parameter
> (no `CodeExpirationMinutes`; Lambda triggers can rewrite the email but
> not shorten code validity). The literal 30-minute target is therefore
> unreachable without replacing the managed reset flow with a custom
> token system (own table + `AdminSetUserPassword` IAM path), which adds
> a credential-reset attack surface we would own.
>
> **Decision:** accept Cognito's AWS-enforced window. The other two
> controls (single-use, safe/non-enumerable errors) PASS. Re-evaluate
> only if a hard external/compliance mandate makes 30 minutes
> non-negotiable, in which case implement the custom flow (TDD,
> `AdminSetUserPassword` privilege review required).
>
> Owner: _(unassigned)_ · Reviewed: 2026-05-16

---

## 3. 🛡️ Input Sanitization & SQL Injection Prevention

- [ ] Every user-facing input field is sanitized before processing
- [ ] Parameterised queries or an ORM are used throughout — no raw string interpolation in SQL
- [ ] Tender/form submission fields are validated both client-side and server-side
- [ ] File upload fields (if any) validate type, size, and content

---

## 4. 🌐 API Access Control

- [ ] API endpoints only accept requests originating from the application's own domain
- [ ] CORS policy is locked down — wildcard `*` origins are not permitted in production
- [ ] API keys or tokens (if applicable) are not exposed in client-side code or public repos

---

## 5. ⏱️ Rate Limiting

- [ ] Rate limiting is active on all public-facing API routes
- [ ] Authentication endpoints (login, register, password reset) have stricter limits
- [ ] Rate limit responses return `429 Too Many Requests` with a `Retry-After` header

---

## 6. ⚠️ Error Handling

- [ ] Custom error screens are in place for all failure states (400, 401, 403, 404, 500, etc.)
- [ ] Error responses never expose stack traces, internal paths, or sensitive system info
- [ ] Unhandled promise rejections and exceptions are caught globally and logged safely

---

## 7. 🗄️ Database Indexes

- [ ] Indexes exist on all high-traffic query fields (foreign keys, filter columns, sort columns)
- [ ] Query performance has been profiled — no full table scans on large tables
- [ ] Index overhead on write-heavy tables has been evaluated and is acceptable

---

## 8. 📋 Logging & Monitoring

- [ ] Application logs are flowing to a centralised log destination (e.g. CloudWatch, Loki)
- [ ] Alerts are configured for critical failure states (5xx error spikes, service crashes, etc.)
- [ ] Sensitive data (passwords, tokens, PII) is never written to logs
- [ ] Log retention policy is defined and compliant with any applicable regulations

---

## 9. 🔄 Rollback Strategy

- [ ] Blue/green deployment is configured and tested
- [ ] Previous stable version is available and can be promoted instantly if needed
- [ ] Rollback procedure is documented and the team knows how to execute it
- [ ] Database migrations (if any) are backwards-compatible with the previous application version

---

## ✅ Final Sign-Off

| Area | Owner | Verified | Date |
| --- | --- | --- | --- |
| Auth & Authorization | | ☐ | |
| Password Reset Flow | (unassigned) | ☑ risk-accepted (see §2 note) | 2026-05-16 |
| Input Sanitization / SQL Injection | | ☐ | |
| API Access Control | | ☐ | |
| Rate Limiting | | ☐ | |
| Error Handling | | ☐ | |
| Database Indexes | | ☐ | |
| Logging & Monitoring | | ☐ | |
| Rollback Strategy | | ☐ | |

---

> **Rule:** If any item is unchecked, the deployment does not proceed.
