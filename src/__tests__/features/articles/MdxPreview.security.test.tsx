/**
 * @format
 * @vitest-environment happy-dom
 * Security tests for article preview rendering.
 */

import { render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MdxPreview } from '@/features/articles/components/MdxPreview'

declare global {
  var __mdxPreviewExecuted: boolean | undefined
}

describe('MdxPreview', () => {
  afterEach(() => {
    globalThis.__mdxPreviewExecuted = undefined
  })

  it('renders article markdown without evaluating embedded JavaScript expressions', async () => {
    const source = `
# Safe heading

{(() => {
  globalThis.__mdxPreviewExecuted = true
  return <p>executed</p>
})()}

<script>globalThis.__mdxPreviewExecuted = true</script>
`

    render(<MdxPreview content={source} />)

    await waitFor(() => {
      expect(document.querySelector('h1')?.textContent).toBe('Safe heading')
    })
    expect(globalThis.__mdxPreviewExecuted).not.toBe(true)
    expect(document.querySelector('script')).toBeNull()
  })

  it('strips raw HTML event-handler injection (img onerror / svg onload)', async () => {
    const source = `
# Heading

<img src="x" onerror="globalThis.__mdxPreviewExecuted = true" />

<svg onload="globalThis.__mdxPreviewExecuted = true"></svg>
`

    render(<MdxPreview content={source} />)

    await waitFor(() => {
      expect(document.querySelector('h1')?.textContent).toBe('Heading')
    })
    // skipHtml drops raw HTML entirely — the dangerous nodes never reach the DOM.
    expect(document.querySelector('img[onerror]')).toBeNull()
    expect(document.querySelector('svg')).toBeNull()
    expect(globalThis.__mdxPreviewExecuted).not.toBe(true)
  })

  it('does not emit javascript: URLs from markdown image syntax', async () => {
    const source = '![alt](javascript:globalThis.__mdxPreviewExecuted=true)'

    render(<MdxPreview content={source} />)

    await waitFor(() => {
      expect(document.querySelector('figure')).not.toBeNull()
    })
    const img = document.querySelector('img')
    expect(img?.getAttribute('src') ?? '').not.toMatch(/^javascript:/i)
    expect(globalThis.__mdxPreviewExecuted).not.toBe(true)
  })
})
