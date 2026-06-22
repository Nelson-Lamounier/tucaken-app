/**
 * Production HTTP server for TanStack Start.
 *
 * Responsibilities:
 *   1. Fast-path static file serving: maps /assets/* → dist/client/assets/*
 *      before any request reaches the SSR handler.
 *   2. SSR delegation: converts Node.js IncomingMessage → Web Request and
 *      pipes the Web Response back to the Node.js ServerResponse.
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createServer } from 'http';
import { createReadStream, statSync } from 'fs';
import { extname, join } from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { randomBytes, randomUUID } from 'crypto';
import { logger } from '../lib/observability/logger';
import { SECURITY_HEADERS, buildCsp } from './security-header-values';
import {
  registry,
  ssrRequestsTotal,
  ssrRequestDurationSeconds,
} from '../lib/observability/metrics';

// ---------------------------------------------------------------------------
// Global crash safety nets
// ---------------------------------------------------------------------------
// Without these, an unhandled rejection or thrown error escaping the request
// path terminates the process with no structured log — invisible in Loki and
// indistinguishable from an OOM kill. Log with full context, then exit non-zero
// so Kubernetes restarts a clean pod (the process state is undefined after an
// uncaught exception; continuing to serve is unsafe).
process.on('unhandledRejection', (reason) => {
  logger.fatal(
    { err: reason instanceof Error ? reason : new Error(String(reason)) },
    'unhandledRejection — exiting',
  );
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'uncaughtException — exiting');
  process.exit(1);
});

// ---------------------------------------------------------------------------
// SSR server export type
// ---------------------------------------------------------------------------
/**
 * Shape of the TanStack Start SSR server bundle produced by `vite build`.
 * The module exports a default object (or the object itself) that contains
 * a Web-standard `fetch` handler.
 */
interface SsrServerExport {
  /** Web-standard fetch handler. */
  fetch?: (request: Request) => Promise<Response>;
  /** Some adapters nest the export under `.default`. */
  default?: SsrServerExport;
}

// ---------------------------------------------------------------------------
// Load SSR handler at runtime (file only exists after `vite build`)
// ---------------------------------------------------------------------------
// We use `createRequire` so TypeScript does not try to resolve the path at
// type-check time. esbuild marks `./dist/*` as external, so Node's ESM
// resolver picks it up from the compiled server.js location at runtime.
const _require = createRequire(import.meta.url);
const serverExport = _require('./dist/server/server.js') as SsrServerExport;

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 5001;

// ---------------------------------------------------------------------------
// Static asset config
// ---------------------------------------------------------------------------
// Vite outputs client assets to dist/client/. Asset URLs are /assets/<hash>.<ext>.
const CLIENT_DIR = join(__dirname, 'dist', 'client');

/** MIME type map for static assets served from dist/client/. */
const MIME_TYPES: Record<string, string> = {
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.webp':  'image/webp',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.woff':  'font/woff',
  '.woff2': 'font/woff2',
  '.ttf':   'font/ttf',
  '.json':  'application/json',
};

function applySecurityHeaders(res: ServerResponse): void {
  for (const [header, value] of SECURITY_HEADERS) {
    res.setHeader(header, value);
  }
}

// ---------------------------------------------------------------------------
// Static file handler
// ---------------------------------------------------------------------------
/**
 * Attempts to serve a static file from `dist/client/`.
 *
 * URL mapping:
 *   /assets/styles-BaHLhT7v.css  →  dist/client/assets/styles-BaHLhT7v.css
 *   /assets/main-BPTnT1y8.js     →  dist/client/assets/main-BPTnT1y8.js
 *
 * @param urlPath - Pathname portion of the request URL (no query string).
 * @param res     - Node.js HTTP server response.
 * @returns `true` if the response was sent; `false` to fall through to SSR.
 */
function tryServeStatic(urlPath: string, res: ServerResponse): boolean {
  // Decode percent-encoded characters (e.g. spaces, non-ASCII filenames).
  let stripped = urlPath;
  try {
    stripped = decodeURIComponent(stripped);
  } catch {
    return false;
  }

  // Guard against path-traversal: resolved path must remain inside CLIENT_DIR.
  const filePath = join(CLIENT_DIR, stripped);
  if (!filePath.startsWith(CLIENT_DIR)) return false;

  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(filePath);
  } catch {
    return false; // file not found — fall through to SSR
  }
  if (!stat.isFile()) return false;

  // Hashed assets (e.g. main-BPTnT1y8.js) are safe to cache immutably.
  // styles.css has a fixed name (no hash) and must not be cached immutably —
  // a new deploy could change its content.
  const isImmutableAsset = stripped.startsWith('/assets/') && /-[\w-]{8,}\.\w+$/.test(stripped);
  const mime = MIME_TYPES[extname(filePath)] ?? 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type':   mime,
    'Content-Length': stat.size,
    'Cache-Control':  isImmutableAsset
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=3600',
  });
  createReadStream(filePath).pipe(res);
  return true;
}

// ---------------------------------------------------------------------------
// SSR handler (TanStack Start)
// ---------------------------------------------------------------------------
const serverHandler: SsrServerExport['fetch'] =
  serverExport.default?.fetch ?? serverExport.fetch;

if (!serverHandler) {
  console.error("Fatal: could not find 'fetch' handler in dist/server/server.js");
  process.exit(1);
}

/** Extended RequestInit that includes the `duplex` option required by Node 22. */
interface NodeRequestInit extends RequestInit {
  duplex?: 'half';
}

const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const start = process.hrtime.bigint();
  const requestId = (req.headers['x-request-id'] as string | undefined) ?? randomUUID();
  res.setHeader('x-request-id', requestId);
  applySecurityHeaders(res);

  // Record RED on response end — covers static + SSR + observability paths.
  // `finish` fires on a fully-flushed response; `close` fires on client abort
  // or socket reset where `finish` never comes. Bind both (guarded so we
  // record exactly once) so an aborted request still produces a metric + log
  // instead of silently vanishing.
  let recorded = false;
  const record = () => {
    if (recorded) return;
    recorded = true;
    const durationSec = Number(process.hrtime.bigint() - start) / 1e9;
    const route = classifyRoute(req.url ?? '/');
    const method = req.method ?? 'GET';
    // res.statusCode is still 200 (the default) on a pre-header abort; mark
    // those 499 (client closed request) so they don't pollute success rates.
    const aborted = !res.writableEnded && !res.headersSent;
    const code = aborted ? 499 : res.statusCode;
    const status = String(code);
    ssrRequestsTotal.inc({ method, route, status_code: status });
    ssrRequestDurationSeconds.observe({ method, route, status_code: status }, durationSec);
    // SLA threshold: a slow 200 is invisible if we only level by status.
    // Escalate any response slower than SSR_SLA_SECONDS to warn so slow
    // paths surface in log-based alerts without a separate metric query.
    const slaSec = Number(process.env['SSR_SLA_SECONDS'] ?? 2);
    let lvl: 'error' | 'warn' | 'info' = 'info';
    if (code >= 500) lvl = 'error';
    else if (code >= 400 || durationSec > slaSec) lvl = 'warn';
    logger[lvl]({
      method, route, status: code,
      duration_ms: Math.round(durationSec * 1000),
      request_id: requestId,
      ...(aborted ? { aborted: true } : {}),
      ...(durationSec > slaSec ? { sla_exceeded: true } : {}),
    }, 'ssr request');
  };
  res.on('finish', record);
  res.on('close', record);

  try {
    const urlPath = req.url?.split('?')[0] ?? '/';

    // Observability endpoints — bypass static + SSR. Probes must NEVER 503
    // because the SSR bundle is slow to warm up; livez stays a 200 always.
    if (req.method === 'GET' && urlPath === '/metrics') {
      const body = await registry.metrics();
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(body);
      return;
    }
    if (req.method === 'GET' && (urlPath === '/livez' || urlPath === '/readyz')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
      return;
    }

    // Stripe webhook endpoint — requires the RAW body bytes to verify the
    // `Stripe-Signature` header. We route it BEFORE the SSR handler so the
    // body never gets parsed/buffered by TanStack Start. The handler is in
    // src/server/stripe-webhook.ts and posts to admin-api via M2M.
    if (req.method === 'POST' && urlPath === '/api/stripe/webhook') {
      // Dynamically import the handler — keeps Stripe SDK off the SSR cold
      // path for the 99 % of requests that aren't webhooks.
      const { handleStripeWebhook } = await import('./stripe-webhook');
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      const rawBody = Buffer.concat(chunks);
      const signature = req.headers['stripe-signature'];
      if (typeof signature !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing Stripe-Signature header' }));
        return;
      }
      try {
        const result = await handleStripeWebhook({ rawBody, signature });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err) {
        // 400 on signature failures, 500 on downstream errors. Stripe only
        // retries 5xx — we want it to GIVE UP on a bad signature (tampering
        // or a misconfigured secret), and we want it to RETRY on transient
        // admin-api failures.
        const message = err instanceof Error ? err.message : String(err);
        const isSig   = message.startsWith('Webhook signature verification failed');
        const status  = isSig ? 400 : 500;
        logger.error(
          { err, status, request_id: requestId },
          'stripe webhook handler error',
        );
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // 1. Fast-path: serve Vite-built static assets directly from disk.
    //    Only GET/HEAD can produce a static file — everything else goes to SSR.
    if ((req.method === 'GET' || req.method === 'HEAD') && tryServeStatic(urlPath, res)) {
      return;
    }

    // 2. SSR: convert Node.js IncomingMessage → Web Request → delegate to TanStack Start.
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

    const headers = new Headers();
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      headers.append(req.rawHeaders[i], req.rawHeaders[i + 1]);
    }

    const init: NodeRequestInit = {
      method:  req.method,
      headers,
      // Required for POST/PUT bodies in Node 22's native fetch compatibility layer.
      duplex: 'half',
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(chunk as Buffer);
      init.body = Buffer.concat(chunks);
    }

    const webReq = new Request(url, init);
    const webRes = await serverHandler(webReq);

    res.statusCode = webRes.status;
    res.statusMessage = webRes.statusText;
    // Use appendHeader (not setHeader) to preserve multiple Set-Cookie values.
    webRes.headers.forEach((value: string, name: string) => res.appendHeader(name, value));
    applySecurityHeaders(res);

    const contentType = res.getHeader('content-type');
    const isHtml = typeof contentType === 'string' && contentType.includes('text/html');

    if (isHtml) {
      // SSR HTML embeds hashed asset URLs — caching the HTML shell causes stale
      // asset references after deploys. Force no-store so browsers get fresh HTML.
      res.setHeader('Cache-Control', 'no-store');

      // Per-request CSP nonce. Buffer the document so the SAME nonce can be
      // stamped onto every <script> (the inline anti-flash bootstrap AND
      // TanStack Start's hydration scripts) and onto a strict Content-Security-
      // Policy (no 'unsafe-inline' on script-src) for this response. Buffering
      // trades streaming SSR for a coherent nonce; the shell is small. The regex
      // skips tags that already carry a nonce and only matches a real <script>
      // tag boundary (followed by whitespace or '>').
      const rawHtml = webRes.body
        ? Buffer.from(await new Response(webRes.body).arrayBuffer())
        : Buffer.alloc(0);
      const nonce = randomBytes(16).toString('base64');
      const html = rawHtml
        .toString('utf-8')
        .replace(/<script(?=[\s>])(?![^>]*\bnonce=)/gi, `<script nonce="${nonce}"`);
      res.setHeader('Content-Security-Policy', buildCsp(nonce));

      const body = Buffer.from(html, 'utf-8');
      res.setHeader('Content-Length', body.byteLength);
      res.end(body);
      return;
    }

    if (webRes.body) {
      const reader = webRes.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    }

    res.end();
  } catch (error) {
    logger.error({ err: error, request_id: requestId, path: req.url }, 'ssr handler error');
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

/**
 * Collapse arbitrary URL paths into a small fixed label set so Prometheus
 * series stay bounded. Per-route SSR tracing already lives in Tempo via
 * the http auto-instrumentation; metrics only need coarse buckets.
 */
function classifyRoute(url: string): string {
  const path = url.split('?')[0];
  if (!path) return 'unknown';
  if (path === '/metrics' || path === '/livez' || path === '/readyz') return path;
  if (path.startsWith('/assets/'))   return '/assets/*';
  if (path.startsWith('/_serverFn')) return '/_serverFn/*';
  if (path.startsWith('/_build/'))   return '/_build/*';
  if (path === '/api/stripe/webhook') return '/api/stripe/webhook';
  // App no longer serves under /admin — basepath removed; all routes start at /.
  if (path === '/') return path;
  return 'other';
}

httpServer.listen(port, process.env.HOST ?? '0.0.0.0', () => {
  logger.info({ host: process.env.HOST ?? '0.0.0.0', port }, 'tucaken-app ssr listening');
});
