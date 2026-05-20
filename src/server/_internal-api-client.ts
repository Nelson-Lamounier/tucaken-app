/**
 * @format
 * Service-to-service client for admin-api `/api/internal/*` routes.
 *
 * Diverges from `apiFetch` (which forwards the end-user's Cognito JWT) by
 * using a Cognito M2M (client_credentials) access token instead. Used by
 * the Stripe webhook handler and pre-checkout customer-ensure flow, both
 * of which run without a user session.
 *
 * Kept deliberately small — no metrics/trace propagation yet because the
 * webhook endpoint is low-volume and not on the user request path. Wire
 * up OTel propagation when the webhook traffic justifies it.
 */

import { logger } from '@/lib/observability/logger'
import { getM2MToken } from './cognito-m2m'
import { MOCK_AUTH } from './_dev-mock'

const ADMIN_API_URL =
  process.env['ADMIN_API_URL'] ?? 'http://admin-api.admin-api:3002'

export interface InternalFetchOptions extends Omit<RequestInit, 'headers' | 'body'> {
  headers?: Record<string, string>
  /** Will be JSON-stringified automatically. Pass `undefined` to omit. */
  json?: unknown
}

export class InternalApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message)
    this.name = 'InternalApiError'
  }
}

/**
 * Calls admin-api's /api/internal/* surface with a fresh service-account
 * access token. Throws `InternalApiError` on non-2xx responses (the caller
 * decides whether to retry or surface to the user).
 *
 * In dev-mock the call is short-circuited and logged — no Cognito M2M setup
 * is required to develop locally.
 */
export async function internalApiFetch<T>(
  path: string,
  opts: InternalFetchOptions = {},
): Promise<T> {
  if (MOCK_AUTH) {
    logger.info(
      { event: 'internal_api_mock_call', path, method: opts.method ?? 'GET' },
      '[dev-mock] internalApiFetch short-circuited',
    )
    // Return an empty object — callers should treat all dev-mock responses
    // as "successful but stateless". Cast through unknown to satisfy T.
    return {} as T
  }

  const token = await getM2MToken()
  const body  = opts.json !== undefined ? JSON.stringify(opts.json) : undefined

  const url = `${ADMIN_API_URL}${path}`
  const response = await fetch(url, {
    ...opts,
    body,
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': body ? 'application/json' : 'application/json',
      Accept:         'application/json',
      ...(opts.headers ?? {}),
    },
  })

  // Read once; reuse for either parse or error context.
  const text = await response.text()
  if (!response.ok) {
    logger.warn(
      { event: 'internal_api_error', path, status: response.status, body: text.slice(0, 500) },
      'internalApiFetch non-2xx',
    )
    throw new InternalApiError(
      `${opts.method ?? 'GET'} ${path} returned ${response.status}`,
      response.status,
      text,
    )
  }

  if (!text) return undefined as T
  return JSON.parse(text) as T
}
