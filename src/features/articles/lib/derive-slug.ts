/**
 * Derives a URL-safe slug from a plain-text title.
 *
 * Rules:
 * - Lowercase
 * - Strip non-alphanumeric characters (except spaces, hyphens, underscores)
 * - Collapse whitespace/underscores to a single hyphen
 * - Collapse consecutive hyphens
 * - Strip leading/trailing hyphens
 *
 * @param title - Raw article title
 * @returns Slugified string suitable for use as an article URL segment
 */
export function deriveSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
