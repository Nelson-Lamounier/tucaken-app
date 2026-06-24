// Split a heading into word tokens for staggered on-view reveal.
export function splitTokens(text: string): string[] {
  return text.split(/\s+/).filter((t) => t.length > 0)
}
