// Splits text into ordered segments, flagging segments that equal `term` for
// emphasis. Used to render a highlighted phrase as <strong> without
// dangerouslySetInnerHTML. Matches the literal term (no regex), so there is no
// injection risk from the term value.
export type HighlightPart = { text: string; highlight: boolean }

export function highlightParts(text: string, term: string): HighlightPart[] {
  if (!term) return [{ text, highlight: false }]
  const parts: HighlightPart[] = []
  let rest = text
  let idx = rest.indexOf(term)
  while (idx !== -1) {
    if (idx > 0) parts.push({ text: rest.slice(0, idx), highlight: false })
    parts.push({ text: term, highlight: true })
    rest = rest.slice(idx + term.length)
    idx = rest.indexOf(term)
  }
  if (rest) parts.push({ text: rest, highlight: false })
  return parts
}
