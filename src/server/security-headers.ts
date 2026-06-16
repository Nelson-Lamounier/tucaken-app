/**
 * @format
 * Security headers middleware for the admin dashboard.
 *
 * Uses TanStack Start's `createMiddleware` and `setResponseHeader` to inject
 * security headers into every server function response. Applied to the
 * `getUserSessionFn` which runs on every route via the root `beforeLoad`.
 *
 * @see https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Headers_Cheat_Sheet.html
 */

import { createMiddleware } from '@tanstack/react-start'
import { setResponseHeader } from '@tanstack/react-start/server'
import { SECURITY_HEADERS } from './security-header-values'

/**
 * Content Security Policy directive.
 *
 * - `unsafe-inline` — required for the inline anti-flash theme bootstrap and
 *   TanStack hydration. `unsafe-eval` is intentionally not allowed.
 * - `connect-src` — wide to support Cognito OAuth, AWS services, and Faro RUM
 * - Stripe Embedded Checkout requires:
 *     · script-src  https://js.stripe.com   (loadStripe injects <script src>)
 *     · frame-src   https://js.stripe.com https://hooks.stripe.com
 *                                            (the embedded payment form iframe)
 *     · connect-src https://api.stripe.com  (telemetry + tokenisation)
 *     · img-src     https://*.stripe.com    (card brand icons; already covered
 *                                            by the wider `https:` allow)
 */
/**
 * TanStack Start server middleware that injects hardened security headers.
 *
 * Apply to any server function via `.middleware([securityHeadersMiddleware])`.
 * Since `getUserSessionFn` runs on every route via `__root.tsx` `beforeLoad`,
 * attaching this middleware there ensures global header coverage.
 */
export const securityHeadersMiddleware = createMiddleware().server(
  async ({ next }) => {
    const result = await next()

    for (const [header, value] of SECURITY_HEADERS) {
      setResponseHeader(header, value)
    }

    return result
  },
)
