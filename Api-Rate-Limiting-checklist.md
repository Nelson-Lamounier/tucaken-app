# 🚦 API Rate Limiting — Production Checklist

Stop bots, protect sensitive endpoints, and keep your infrastructure alive under traffic spikes. One decorator. Zero business logic pollution.

---

## 1. 🧠 Algorithm — Token Bucket

- [ ] Rate limiter uses the **Token Bucket algorithm** (not fixed window — avoids burst edge cases at window resets)
- [ ] Bucket refill rate and capacity are tuned per endpoint sensitivity
- [ ] Algorithm behaviour is tested: gradual usage within limit passes, burst beyond limit is rejected cleanly

**How Token Bucket works:**

```
Each user gets a "bucket" of tokens
  → Every request costs 1 token
  → Tokens refill at a fixed rate (e.g. 5 per minute)
  → If the bucket is empty → 429 Too Many Requests
  → Request is killed before it touches any business logic
```

---

## 2. 🔑 Limiter Initialisation

- [ ] Limiter is initialised using the **user's IP address** as the unique key
- [ ] Key strategy is reviewed — consider falling back to authenticated user ID when available (IP alone can be shared on NAT networks)
- [ ] Limiter backend (in-memory, Redis, etc.) is chosen based on whether the app runs on single or multiple instances
- [ ] Redis backend used for **multi-instance deployments** — in-memory limiters do not share state across pods

```python
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
```

---

## 3. 🎛️ Endpoint-Level Limits

Different endpoints carry different risk profiles. Limits must reflect that.

- [ ] High-traffic browse/read endpoints have **generous limits** (e.g. 100/minute)
- [ ] Sensitive or destructive endpoints have **strict limits** (e.g. 3–5/minute)
- [ ] Each endpoint has its limit explicitly declared via decorator — no endpoint is accidentally unprotected
- [ ] Limits are documented so they can be reviewed and adjusted without reading code

**Reference limit table — adjust to your traffic:**

| Endpoint Type | Example | Suggested Limit |
|---|---|---|
| Product browsing / reads | `GET /products` | 100 / minute |
| Search | `GET /search` | 30 / minute |
| Account login | `POST /login` | 5 / minute |
| Password reset | `POST /reset-password` | 3 / minute |
| OTP / verification | `POST /verify` | 5 / minute |
| Checkout / payment | `POST /checkout` | 10 / minute |
| Admin actions | `POST /admin/*` | 10 / minute |

---

## 4. 🛡️ Decorator Implementation

- [ ] Rate limit is applied via a **single decorator per endpoint** — no manual counter logic in business code
- [ ] Decorator string format is correct: `"N/period"` (e.g. `"5/minute"`, `"3/hour"`)
- [ ] All sensitive endpoints have a decorator applied — verified by code review or automated test

```python
from fastapi import APIRouter, Request
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)
router = APIRouter()

# Generous limit — browsing is low risk
@router.get("/products")
@limiter.limit("100/minute")
async def get_products(request: Request):
    return {"products": [...]}

# Strict limit — password reset is high risk
@router.post("/reset-password")
@limiter.limit("3/minute")
async def reset_password(request: Request):
    return {"status": "reset email sent"}
```

---

## 5. 🚫 429 Response Handling

- [ ] Requests that exceed the limit receive a **`429 Too Many Requests`** response immediately
- [ ] The request is **killed before it reaches any business logic or database layer**
- [ ] Response includes a `Retry-After` header so clients know when to try again
- [ ] `429` response body is a clean, user-friendly message — no internal details exposed

```python
from slowapi.errors import RateLimitExceeded
from fastapi.responses import JSONResponse

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": "Too many requests. Please slow down and try again shortly."},
        headers={"Retry-After": "60"}
    )
```

---

## 6. 📋 Logging & Monitoring

- [ ] Rate limit hits are **logged** with IP address (or user ID), endpoint, and timestamp
- [ ] A monitoring alert is configured if 429s spike above a defined threshold — signals active bot traffic or abuse
- [ ] Logs are reviewed periodically to identify patterns and tune limits
- [ ] Sensitive fields (passwords, tokens) are never present in rate limit log entries

---

## 7. 🧪 Testing

- [ ] Unit test: requests within limit return `200`
- [ ] Unit test: requests beyond limit return `429` before hitting the handler
- [ ] Integration test: limit resets correctly after the time window expires
- [ ] Tested across endpoint types: permissive (browse) and strict (reset) limits both behave as configured
- [ ] Tested under concurrent load — limiter holds under parallel requests from the same IP

---

## ✅ Final Sign-Off

| Area | Owner | Verified | Date |
|---|---|---|---|
| Token Bucket algorithm configured | | ☐ | |
| Limiter initialised with IP key | | ☐ | |
| Redis backend for multi-instance | | ☐ | |
| Limits defined per endpoint type | | ☐ | |
| Decorator applied to all endpoints | | ☐ | |
| 429 response + Retry-After header | | ☐ | |
| Request killed before business logic | | ☐ | |
| Logging + monitoring alerts active | | ☐ | |
| Tests passing for all limit tiers | | ☐ | |

---

## Full Request Flow

```
Incoming Request
  → Extract IP address (key_func)
  → Check token bucket for this IP + endpoint
      ├── Tokens available  → Deduct 1 token → Pass to handler ✅
      └── Bucket empty      → 429 Too Many Requests 🚫
                              (request never reaches business logic)
```

---

> **Rule:** Every endpoint must have an explicit limit. No endpoint should be reachable by a bot at unlimited speed — not even a read endpoint.