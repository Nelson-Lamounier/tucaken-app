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
})
