/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks (hoisted before component import)
// ---------------------------------------------------------------------------

const mockUploadArticleImage = vi.fn()
vi.mock('@/features/articles/lib/upload-article-image', () => ({
  uploadArticleImage: (...args: unknown[]) => mockUploadArticleImage(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/lib/stores/toast-store', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

import { ArticleImagesPanel } from '@/features/articles/components/ArticleImagesPanel'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MD_WITH_ONE_PLACEHOLDER =
  'intro\n<ImageRequest id="bff-architecture-hero" instruction="Hero banner showing a cluster" type="hero" />\nbody'

function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArticleImagesPanel', () => {
  it('renders nothing when the content has no placeholders', () => {
    const { container } = render(<ArticleImagesPanel contentMd="# just prose" />)
    expect(container.innerHTML).toBe('')
  })

  it('renders a slot per placeholder with its id and instruction', () => {
    render(<ArticleImagesPanel contentMd={MD_WITH_ONE_PLACEHOLDER} />)
    expect(screen.getByText('bff-architecture-hero')).toBeTruthy()
    expect(screen.getByText('Hero banner showing a cluster')).toBeTruthy()
  })

  it('uploads the selected file against the placeholder id and toasts success', async () => {
    mockUploadArticleImage.mockResolvedValue({
      url: 'https://nelsonlamounier.com/images/articles/bff-architecture-hero.png',
      ext: 'png',
    })
    render(<ArticleImagesPanel contentMd={MD_WITH_ONE_PLACEHOLDER} />)

    const input = screen.getByLabelText(/image/i)
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await waitFor(() => {
      expect(mockUploadArticleImage).toHaveBeenCalledWith(expect.anything(), 'bff-architecture-hero')
    })
    expect(mockAddToast).toHaveBeenCalledWith('success', expect.stringContaining('bff-architecture-hero'))
  })

  it('toasts an error and does not throw when the upload fails', async () => {
    mockUploadArticleImage.mockRejectedValue(new Error('boom'))
    render(<ArticleImagesPanel contentMd={MD_WITH_ONE_PLACEHOLDER} />)

    const input = screen.getByLabelText(/image/i)
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringMatching(/failed/i))
    })
  })

  it('disables the upload input when disabled is true', () => {
    render(<ArticleImagesPanel contentMd={MD_WITH_ONE_PLACEHOLDER} disabled />)
    const input = screen.getByLabelText(/image/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })
})
