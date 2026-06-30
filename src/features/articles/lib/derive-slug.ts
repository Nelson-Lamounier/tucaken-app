/**
 * Derives a URL-safe slug from a plain-text title or filename.
 *
 * Rules:
 * - Strip `.md` extension (if present) — allows filenames like `my-article.md`
 *   to be passed directly; no-op for plain titles
 * - Lowercase
 * - Strip non-alphanumeric characters (except spaces, hyphens, underscores)
 * - Collapse whitespace/underscores to a single hyphen
 * - Collapse consecutive hyphens
 * - Strip leading/trailing hyphens
 *
 * @param title - Raw article title or filename (e.g. `my-article.md`)
 * @returns Slugified string suitable for use as an article URL segment
 */
export function deriveSlug(title: string): string {
  return title
    .replace(/\.md$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
