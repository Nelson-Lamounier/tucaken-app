/**
 * @format
 * Server-only deployment origin helper.
 */

export function getAppOrigin(): string {
  const origin = process.env.APP_ORIGIN ?? process.env.APP_URL
  if (origin) return origin

  // Fail loudly in production rather than silently emitting localhost URLs
  // (e.g. into Stripe return URLs), which would break the post-portal redirect.
  if (process.env.NODE_ENV === 'production') {
    throw new Error('APP_ORIGIN (or APP_URL) must be set in production')
  }

  return 'http://localhost:5001'
}
