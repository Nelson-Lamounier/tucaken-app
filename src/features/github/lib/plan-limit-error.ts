/**
 * If `err` is an admin-api plan/quota limit error, return its user-facing detail
 * (e.g. "Your plan allows 1 repository. Upgrade for more."); otherwise null.
 *
 * The API client formats errors as
 *   "admin-api POST /github/connected-repos failed [403] — <detail>"
 * The repo-count limit comes back as 403 and the monthly-quota limit as 429;
 * both carry a "plan allows" / "limit" / "upgrade" detail and should route to
 * the upgrade UI rather than a raw error toast. A bare 403/429 without that
 * wording (e.g. a generic "Forbidden") is NOT treated as a plan limit.
 */
export function planLimitMessage(err: Error): string | null {
  const msg = err.message
  const isLimitStatus = msg.includes('[403]') || msg.includes('[429]')
  if (!isLimitStatus) return null
  if (!/plan allows|limit|upgrade/i.test(msg)) return null
  const detail = msg.split(' — ')[1]?.trim()
  return detail && detail.length > 0 ? detail : 'You have reached your plan limit.'
}
