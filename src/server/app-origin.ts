/**
 * @format
 * Server-only deployment origin helper.
 */

export function getAppOrigin(): string {
  return process.env.APP_ORIGIN ?? process.env.APP_URL ?? 'http://localhost:5001'
}
