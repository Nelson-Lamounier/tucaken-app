import { describe, it, expect } from 'vitest'
import { normaliseMermaidSource } from '@/features/projects/lib/mermaid-normalise'

describe('normaliseMermaidSource', () => {
  it('replaces literal \\n inside a label with <br/> and quotes it', () => {
    const out = normaliseMermaidSource('graph LR\n  App[tucaken-app\\nTanStack Start SSR]')
    expect(out).not.toMatch(/\\n/)
    expect(out).toContain('["tucaken-app<br/>TanStack Start SSR"]')
  })
  it('quotes hexagon + cylinder labels, leaves safe stadium labels', () => {
    expect(normaliseMermaidSource('A{{AWS Bedrock\\nSonnet / Haiku}}')).toContain('{{"AWS Bedrock<br/>Sonnet / Haiku"}}')
    expect(normaliseMermaidSource('B[(RDS PostgreSQL\\n+ pgvector)]')).toContain('[("RDS PostgreSQL<br/>+ pgvector")]')
    expect(normaliseMermaidSource('U([Job-seeker])')).toContain('([Job-seeker])')
  })
  it('leaves real newlines intact', () => {
    expect(normaliseMermaidSource('graph LR\n  A-->B\n  B-->C').split('\n')).toHaveLength(3)
  })
  it('escapes a literal double-quote inside a wrapped label', () => {
    expect(normaliseMermaidSource('N[say "hi".now]')).toContain('["say &quot;hi&quot;.now"]')
  })
  it('is idempotent', () => {
    const once = normaliseMermaidSource('graph LR\n  App[admin-api BFF\\nHono]')
    expect(normaliseMermaidSource(once)).toBe(once)
  })
  it('is total: empty / non-string returns unchanged', () => {
    expect(normaliseMermaidSource('')).toBe('')
    expect(normaliseMermaidSource(undefined as unknown as string)).toBe(undefined)
  })
})
