/**
 * @format
 * Framework-agnostic security header values shared by TanStack middleware and
 * the production Node server.
 *
 * Two CSP variants:
 *   - `buildCsp(nonce)` — strict document policy: `script-src` carries a
 *     per-request `'nonce-…'` and NO `'unsafe-inline'`. The prod server
 *     (`patches.ts`) injects the same nonce into every `<script>` in the SSR
 *     HTML, so the app's inline anti-flash bootstrap and TanStack Start's
 *     hydration scripts run, while any injected inline script does not.
 *   - the static `SECURITY_HEADERS` below — a SAFE FALLBACK used for non-document
 *     responses (JSON server fns carry no scripts) and as the pre-override
 *     default. It keeps `'unsafe-inline'` so a document is never accidentally
 *     served a nonce-less strict policy (which would block hydration). The
 *     document path always overrides this with `buildCsp(nonce)`.
 */

function scriptSrc(nonce?: string): string {
  const google = 'https://www.googletagmanager.com'
  if (nonce) return `script-src 'self' 'nonce-${nonce}' https://js.stripe.com ${google}`
  return `script-src 'self' 'unsafe-inline' https://js.stripe.com ${google}`
}

/**
 * Build the CSP directive string. Pass a per-request `nonce` for document
 * responses to get the strict (no-`unsafe-inline`) script policy.
 */
export function buildCsp(nonce?: string): string {
  return [
    "default-src 'self'",
    scriptSrc(nonce),
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self' https:",
    "connect-src 'self' https://*.nelsonlamounier.com https://*.amazonaws.com https://*.amazoncognito.com https://api.stripe.com https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
    "frame-src https://js.stripe.com https://hooks.stripe.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')
}

const CSP_DIRECTIVES = buildCsp()

export const SECURITY_HEADERS: ReadonlyArray<readonly [string, string]> = [
  ['Strict-Transport-Security', 'max-age=31536000; includeSubDomains'],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=()'],
  ['Content-Security-Policy', CSP_DIRECTIVES],
] as const
