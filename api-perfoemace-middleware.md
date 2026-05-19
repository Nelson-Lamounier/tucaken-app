# ⚡ Measuring API Performance with Middleware

No manual timers. No cluttered business logic. One middleware traps every request automatically.

---

## The Core Concept

Instead of adding timing code to each individual endpoint, you write a **single middleware** that wraps the entire API. Every request passes through it — success or failure — giving you consistent, automatic performance logging across the board.

---

## Implementation

### 1. Initialise the FastAPI App

```python
from fastapi import FastAPI, Request
import time
import logging

app = FastAPI()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)
```

---

### 2. Write the Timing Middleware

```python
import time
from starlette.middleware.base import BaseHTTPMiddleware
from fastapi import Request

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start_time = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception as e:
            # Middleware still completes even if the backend throws
            duration = time.perf_counter() - start_time
            logger.error(f"Request to {request.url.path} failed after {duration:.2f}s — {e}")
            raise

        duration = time.perf_counter() - start_time
        status = response.status_code

        logger.info(f"Request to {request.url.path} | status={status} | duration={duration:.2f}s")

        return response

app.add_middleware(TimingMiddleware)
```

**Key behaviours:**
- `start_time` is captured before `call_next` — that's your clock starting
- `call_next` hands off to the actual endpoint logic
- The timer stops and logs **after** the response is returned, no matter what
- If the backend throws a 500, the middleware still catches the status and logs the duration before re-raising

---

### 3. Add a Test Endpoint (Simulated Heavy Query)

```python
import asyncio
from fastapi import APIRouter

router = APIRouter()

@router.get("/heavy-task")
async def heavy_task():
    await asyncio.sleep(1.5)  # Simulates a slow database query
    return {"status": "done"}

app.include_router(router)
```

---

### 4. What You See in the Terminal

Hit `GET /heavy-task` and the middleware prints immediately after the response:

```
INFO: Request to /heavy-task | status=200 | duration=1.50s
```

No logging inside the endpoint. No manual timers. The middleware handles it all.

---

## Error Path — What Happens on a 500?

```python
@router.get("/broken-task")
async def broken_task():
    raise ValueError("Something went wrong")
```

Terminal output:

```
ERROR: Request to /broken-task failed after 0.01s — Something went wrong
```

The middleware catches the exception, logs the duration and error, then re-raises so FastAPI's normal error handling takes over. Your observability is intact even in failure states.

---

## Why This Pattern Works

| Approach | Manual Timers | Middleware |
|---|---|---|
| Setup effort | Per endpoint | Once, globally |
| Consistency | Easy to forget | Guaranteed |
| Error coverage | Must add try/catch everywhere | Automatic |
| Business logic pollution | High | None |
| Rollout to new endpoints | Manual | Instant |

---

## Extensions to Consider

- **Add to a structured logger** — emit JSON logs for ingestion into Loki, CloudWatch, or Datadog
- **Attach a request ID** — generate a UUID per request and pass it through context for trace correlation
- **Threshold alerts** — log a warning if `duration` exceeds a defined SLA (e.g. `> 2.0s`)
- **Expose as a Prometheus metric** — push duration into a histogram for Grafana dashboards
- **Middleware stack ordering** — place the timing middleware first so it wraps everything, including auth and rate limiting middleware

---

## Quick Reference

```python
# Minimal working version
from starlette.middleware.base import BaseHTTPMiddleware
import time, logging

logger = logging.getLogger(__name__)

class TimingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        t = time.perf_counter()
        response = await call_next(request)
        logger.info(f"{request.url.path} → {response.status_code} in {time.perf_counter() - t:.2f}s")
        return response
```

> **Rule:** Observability belongs in the infrastructure layer, not the business logic.