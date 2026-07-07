/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks (hoisted before component import)
// ---------------------------------------------------------------------------

const mockUploadCoverImage = vi.fn()
vi.mock('@/features/articles/lib/upload-cover-image', () => ({
  uploadCoverImage: (...args: unknown[]) => mockUploadCoverImage(...args),
}))

const mockAddToast = vi.fn()
vi.mock('@/lib/stores/toast-store', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

import { CoverImageField } from '@/features/articles/components/CoverImageField'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile() {
  return new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
}

beforeEach(() => {
  vi.clearAllMocks()
  // happy-dom does not always implement object URLs — stub deterministically.
  globalThis.URL.createObjectURL = vi.fn(() => 'blob:preview')
  globalThis.URL.revokeObjectURL = vi.fn()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CoverImageField', () => {
  it('shows the upload prompt and no Remove button when value is null', () => {
    render(<CoverImageField value={null} onChange={vi.fn()} slug="my-article" />)
    expect(screen.getByText(/click to upload an image/i)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
  })

  it('disables the upload input and shows a hint when the slug is empty', () => {
    render(<CoverImageField value={null} onChange={vi.fn()} slug="" />)
    expect(screen.getByText(/complete the article details above/i)).toBeTruthy()
    const input = screen.getByLabelText(/complete the article details above/i) as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('uploads the selected file and calls onChange with the returned url', async () => {
    mockUploadCoverImage.mockResolvedValue('https://nelsonlamounier.com/images/articles/cover.png')
    const onChange = vi.fn()
    render(<CoverImageField value={null} onChange={onChange} slug="my-article" />)

    const input = screen.getByLabelText(/click to upload an image/i)
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await waitFor(() => {
      expect(mockUploadCoverImage).toHaveBeenCalledTimes(1)
    })
    expect(onChange).toHaveBeenCalledWith('https://nelsonlamounier.com/images/articles/cover.png')
  })

  it('renders a Remove button when a value is present and clears it on click', () => {
    const onChange = vi.fn()
    render(
      <CoverImageField
        value="https://nelsonlamounier.com/images/articles/cover.png"
        onChange={onChange}
        slug="my-article"
      />,
    )

    const removeBtn = screen.getByRole('button', { name: /remove/i })
    fireEvent.click(removeBtn)
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('shows a toast and does not call onChange when the upload fails', async () => {
    mockUploadCoverImage.mockRejectedValue(new Error('boom'))
    const onChange = vi.fn()
    render(<CoverImageField value={null} onChange={onChange} slug="my-article" />)

    const input = screen.getByLabelText(/click to upload an image/i)
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } })
    })

    await waitFor(() => {
      expect(mockAddToast).toHaveBeenCalledWith('error', expect.stringMatching(/upload failed/i))
    })
    expect(onChange).not.toHaveBeenCalled()
  })
})
