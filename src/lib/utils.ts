/** Tiny classnames joiner. Drops falsy parts and space-joins the rest.
 *  Shared so feature/UI code stops re-declaring local `classNames` helpers. */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}
