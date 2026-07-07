import { describe, it, expect } from 'vitest'
import { parseImageRequests } from '@/features/articles/lib/parse-image-requests'

describe('parseImageRequests', () => {
  it('extracts id + instruction from self-closing ImageRequest tags', () => {
    const md = `intro\n<ImageRequest id="bff-architecture-hero" instruction="Hero banner showing a cluster" type="hero" />\nbody`
    expect(parseImageRequests(md)).toEqual([
      { id: 'bff-architecture-hero', instruction: 'Hero banner showing a cluster' },
    ])
  })

  it('handles multiple placeholders, attribute order variance, and dedupes by id', () => {
    const md = [
      '<ImageRequest instruction="First diagram" id="diag-one" />',
      '<ImageRequest id="diag-two" instruction="Second" />',
      '<ImageRequest id="diag-one" instruction="Duplicate mention" />',
    ].join('\n')
    expect(parseImageRequests(md).map((p) => p.id)).toEqual(['diag-one', 'diag-two'])
  })

  it('returns [] for content without placeholders and ignores malformed ids', () => {
    expect(parseImageRequests('# just prose')).toEqual([])
    expect(parseImageRequests('<ImageRequest id="../evil" instruction="x" />')).toEqual([])
  })
})
