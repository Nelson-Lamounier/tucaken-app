/** A shot-list placeholder found in article MDX. */
export interface ImageRequestPlaceholder {
  readonly id: string
  readonly instruction: string
}

const TAG_RE = /<ImageRequest\b[^>]*?\/>/g
const ID_RE = /\bid="([a-z0-9][a-z0-9-]*)"/
const INSTRUCTION_RE = /\binstruction="([^"]*)"/

/**
 * Extract shot-list placeholders from article MDX, deduplicated by id in
 * document order. Ids must match the servable-filename charset — anything
 * else is ignored (it could never resolve to an S3 key).
 */
export function parseImageRequests(contentMd: string): ImageRequestPlaceholder[] {
  const seen = new Set<string>()
  const out: ImageRequestPlaceholder[] = []
  for (const tag of contentMd.match(TAG_RE) ?? []) {
    const id = ID_RE.exec(tag)?.[1]
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push({ id, instruction: INSTRUCTION_RE.exec(tag)?.[1] ?? '' })
  }
  return out
}
