/**
 * @format
 * Retry-After helpers for quota-exhaustion (429) responses.
 *
 * Monthly free-tier quotas reset at the first instant of the next calendar
 * month in UTC (matching the `DATE_TRUNC('month', NOW())` period key used by
 * usage_quotas). RFC 6585 lets the client back off until exactly that point.
 */

/**
 * Whole seconds from `now` until 00:00:00 UTC on the first of next month.
 * Always >= 1 so the header never advertises an immediate retry.
 */
export function secondsUntilNextMonthUTC(now: Date = new Date()): number {
  const nextMonth = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((nextMonth - now.getTime()) / 1000));
}
