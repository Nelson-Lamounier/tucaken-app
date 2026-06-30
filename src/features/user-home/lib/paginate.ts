export interface PageInfo {
  /** Total number of pages (always at least 1). */
  readonly pageCount: number
  /** The requested page clamped into range. */
  readonly safePage: number
  /** Slice start index (inclusive). */
  readonly start: number
  /** Slice end index (exclusive). */
  readonly end: number
}

/**
 * Clamp a page index and return slice bounds for a list of `total` items shown
 * `size` per page. Always reports at least one page, and clamps out-of-range
 * pages (e.g. when the list shrinks under the current page) so callers never
 * read past the ends.
 */
export function paginate(total: number, page: number, size: number): PageInfo {
  const pageCount = Math.max(1, Math.ceil(total / size))
  const safePage = Math.min(Math.max(0, page), pageCount - 1)
  const start = safePage * size
  const end = Math.min(start + size, total)
  return { pageCount, safePage, start, end }
}
