/**
 * URL/link normalization shared by every resume + cover-letter export path
 * (on-screen anchors, .doc HTML, .pdf link annotations, .txt full URLs).
 * Profile fields are stored bare (e.g. "linkedin.com/in/x", "alex@mail.com"),
 * so each consumer needs a real href to make the link actionable.
 */

/** `mailto:` href for an email address (idempotent if already prefixed). */
export function emailHref(email: string): string {
  const v = email.trim()
  return v.toLowerCase().startsWith('mailto:') ? v : `mailto:${v}`
}

/** `tel:` href; strips formatting so dialers accept it. */
export function telHref(phone: string): string {
  const v = phone.trim()
  if (v.toLowerCase().startsWith('tel:')) return v
  return `tel:${v.replace(/[^\d+]/g, '')}`
}

/** Absolute https URL for a bare or scheme-prefixed web address. */
export function urlHref(value: string): string {
  const v = value.trim()
  if (/^https?:\/\//i.test(v)) return v
  if (v.startsWith('//')) return `https:${v}`
  return `https://${v.replace(/^\/+/, '')}`
}
