/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'

// ---------------------------------------------------------------------------
// Mocks (must be hoisted before component import)
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn()

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ to, children, ...props }: { to: string; children: React.ReactNode; [key: string]: unknown }) =>
    <a href={to} {...props}>{children}</a>,
}))

const mockCreateArticleFn = vi.fn()
const mockCheckSlugAvailableFn = vi.fn()

vi.mock('@/server/articles', () => ({
  createArticleFn: (...args: unknown[]) => mockCreateArticleFn(...args),
  checkSlugAvailableFn: (...args: unknown[]) => mockCheckSlugAvailableFn(...args),
}))

const mockUploadCoverImage = vi.fn()

vi.mock('@/features/articles/lib/upload-cover-image', () => ({
  uploadCoverImage: (...args: unknown[]) => mockUploadCoverImage(...args),
}))

const mockAddToast = vi.fn()

vi.mock('@/lib/stores/toast-store', () => ({
  useToastStore: (selector: (s: { addToast: typeof mockAddToast }) => unknown) =>
    selector({ addToast: mockAddToast }),
}))

// Mock MarkdownEditor to avoid complex DOM dependencies
vi.mock('@/features/articles/components/MarkdownEditor', () => ({
  MarkdownEditor: ({
    value,
    onChange,
  }: {
    value: string
    onChange: (v: string) => void
  }) => (
    <textarea
      data-testid="markdown-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}))

// ---------------------------------------------------------------------------
// Component under test (imported AFTER mocks)
// ---------------------------------------------------------------------------

import { ArticleBuilder } from '@/features/articles/components/ArticleBuilder'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fillForm({
  title = 'My Test Article',
  slug = 'my-test-article',
  content = 'Some content here',
}: { title?: string; slug?: string; content?: string } = {}) {
  fireEvent.change(screen.getByLabelText(/title/i), { target: { value: title } })
  // Overwrite auto-derived slug
  const slugInput = screen.getByLabelText(/slug/i)
  fireEvent.change(slugInput, { target: { value: slug } })
  fireEvent.change(screen.getByTestId('markdown-editor'), { target: { value: content } })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ArticleBuilder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: slug available
    mockCheckSlugAvailableFn.mockResolvedValue({ available: true })
    mockCreateArticleFn.mockResolvedValue({ success: true, slug: 'my-test-article' })
    mockNavigate.mockResolvedValue(undefined)
  })

  // -------------------------------------------------------------------------
  // Test 1: happy path — save draft
  // -------------------------------------------------------------------------
  it('calls createArticleFn with status draft and navigates to /articles on save', async () => {
    render(<ArticleBuilder />)

    await act(async () => {
      fillForm()
    })

    // Portfolio checkbox is checked by default — leave it
    const saveDraftBtn = screen.getByRole('button', { name: /save draft/i })

    await act(async () => {
      fireEvent.click(saveDraftBtn)
    })

    await waitFor(() => {
      expect(mockCreateArticleFn).toHaveBeenCalledTimes(1)
    })

    const callArg = mockCreateArticleFn.mock.calls[0][0]
    expect(callArg.data.status).toBe('draft')
    expect(callArg.data.title).toBe('My Test Article')
    expect(callArg.data.slug).toBe('my-test-article')
    expect(callArg.data.contentMd).toBe('Some content here')
    expect(callArg.data.destinations).toContain('portfolio')

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith({ to: '/articles' })
    })
  })

  // -------------------------------------------------------------------------
  // Test 2: no destinations — blocked
  // -------------------------------------------------------------------------
  it('shows destination error and does not call createArticleFn when all destinations unchecked', async () => {
    render(<ArticleBuilder />)

    await act(async () => {
      fillForm()
      // Uncheck "portfolio" (the default)
      const portfolioCheckbox = screen.getByRole('checkbox', { name: /personal portfolio/i })
      fireEvent.click(portfolioCheckbox)
    })

    // Error message should appear
    expect(screen.getByText(/select at least one destination/i)).toBeTruthy()

    const saveDraftBtn = screen.getByRole('button', { name: /save draft/i })
    await act(async () => {
      fireEvent.click(saveDraftBtn)
    })

    expect(mockCreateArticleFn).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 3: manual slug lock — title change must not overwrite a typed slug
  // -------------------------------------------------------------------------
  it('preserves a manually-typed slug when the title is changed afterwards', async () => {
    render(<ArticleBuilder />)

    const slugInput = screen.getByLabelText(/slug/i)

    // Manually type a custom slug first
    await act(async () => {
      fireEvent.change(slugInput, { target: { value: 'my-custom-slug' } })
    })

    // Now change the title — should NOT overwrite the manually-edited slug
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'A Completely Different Title' },
      })
    })

    expect((slugInput as HTMLInputElement).value).toBe('my-custom-slug')
  })

  // -------------------------------------------------------------------------
  // Test 4: slug unavailable — blocked
  // -------------------------------------------------------------------------
  it('shows slug taken error and does not call createArticleFn when slug is unavailable', async () => {
    mockCheckSlugAvailableFn.mockResolvedValue({ available: false })

    render(<ArticleBuilder />)

    await act(async () => {
      fillForm({ slug: 'taken-slug' })
    })

    // Wait for the debounced slug check (400 ms)
    await waitFor(
      () => {
        expect(screen.getByText(/already taken/i)).toBeTruthy()
      },
      { timeout: 1000 },
    )

    const saveDraftBtn = screen.getByRole('button', { name: /save draft/i })
    await act(async () => {
      fireEvent.click(saveDraftBtn)
    })

    expect(mockCreateArticleFn).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // Test 5 (Fix 1): auto-derived slug triggers availability check
  // -------------------------------------------------------------------------
  it('triggers slug availability check for auto-derived slugs and blocks submit when unavailable', async () => {
    mockCheckSlugAvailableFn.mockResolvedValue({ available: false })

    render(<ArticleBuilder />)

    // Type ONLY the title — let the slug auto-derive (do NOT manually set slug)
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/title/i), {
        target: { value: 'My Auto Derived Title' },
      })
      fireEvent.change(screen.getByTestId('markdown-editor'), {
        target: { value: 'Some content here' },
      })
    })

    // Wait for the debounced slug availability check to surface the error
    await waitFor(
      () => {
        expect(screen.getByText(/already taken/i)).toBeTruthy()
      },
      { timeout: 1000 },
    )

    const saveDraftBtn = screen.getByRole('button', { name: /save draft/i })
    await act(async () => {
      fireEvent.click(saveDraftBtn)
    })

    // createArticleFn must NOT be called when slug is unavailable
    expect(mockCreateArticleFn).not.toHaveBeenCalled()
  })
})
