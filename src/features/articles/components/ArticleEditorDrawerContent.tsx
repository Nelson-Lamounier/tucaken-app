import { useCallback, useEffect, useState } from 'react'
import {
  useArticleContent,
  useArticleMetadata,
  useSaveContent,
  useUpdateMetadata,
} from '@/hooks/use-admin-articles'
import { useToastStore } from '@/lib/stores/toast-store'
import { MarkdownEditor } from './MarkdownEditor'
import { CoverImageField } from './CoverImageField'
import { ArticleImagesPanel } from './ArticleImagesPanel'

interface ArticleEditorDrawerContentProps {
  /** The article slug to load content for */
  readonly slug: string
  /** Called when the user successfully saves and wants to close */
  readonly onClose: () => void
}

/**
 * Self-contained editor for an existing article: edits the MDX body and the
 * cover (hero) image, then saves both. Designed to render inside a
 * `DashboardDrawer` overlay.
 *
 * Content is saved via the content endpoint; the cover image is persisted as
 * article metadata (`PUT /articles/:slug`). A single "Save Changes" commits
 * whichever of the two is dirty.
 *
 * @param props - Component props
 * @returns Editor content JSX
 */
export function ArticleEditorDrawerContent({
  slug,
  onClose,
}: ArticleEditorDrawerContentProps) {
  const { addToast } = useToastStore()

  // ── TanStack Query hooks ────────────────────────────────────────────────────
  const {
    data: articleData,
    isLoading,
    error: queryError,
    refetch,
  } = useArticleContent(slug)

  const { data: metadata } = useArticleMetadata(slug)

  const saveMutation = useSaveContent()
  const coverMutation = useUpdateMetadata()

  // ── Local editor state ──────────────────────────────────────────────────────
  const [content, setContent] = useState('')
  const [originalContent, setOriginalContent] = useState('')
  const [isInitialised, setIsInitialised] = useState(false)

  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [originalCover, setOriginalCover] = useState<string | null>(null)
  const [coverInitialised, setCoverInitialised] = useState(false)
  const [uploadingCover, setUploadingCover] = useState(false)

  // Derived values
  const contentDirty = content !== originalContent
  const coverDirty = coverInitialised && coverImage !== originalCover
  const hasUnsavedChanges = contentDirty || coverDirty
  const isSaving = saveMutation.isPending || coverMutation.isPending
  const error = queryError?.message ?? null

  // ── Sync fetched content into local state (only on initial load) ────────────
  useEffect(() => {
    if (articleData && !isInitialised) {
      setContent(articleData.content ?? '')
      setOriginalContent(articleData.content ?? '')
      setIsInitialised(true)
    }
  }, [articleData, isInitialised])

  // ── Sync fetched cover into local state (only on initial load) ──────────────
  useEffect(() => {
    if (metadata && !coverInitialised) {
      setCoverImage(metadata.coverImage ?? null)
      setOriginalCover(metadata.coverImage ?? null)
      setCoverInitialised(true)
    }
  }, [metadata, coverInitialised])

  /**
   * Persists whichever of content / cover image has changed. Content goes to
   * the content endpoint; the cover image is written as article metadata.
   */
  const handleSave = useCallback(async () => {
    try {
      if (contentDirty) {
        await saveMutation.mutateAsync({ slug, content })
        setOriginalContent(content)
      }
      if (coverDirty) {
        await coverMutation.mutateAsync({ slug, updates: { coverImage } })
        setOriginalCover(coverImage)
      }
      addToast('success', 'Changes saved.')
    } catch (err: unknown) {
      addToast('error', err instanceof Error ? err.message : 'Save failed.')
    }
  }, [
    slug,
    content,
    contentDirty,
    coverImage,
    coverDirty,
    saveMutation,
    coverMutation,
    addToast,
  ])

  // ── Keyboard shortcut: Cmd/Ctrl + S ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        if (hasUnsavedChanges && !isSaving && !uploadingCover) {
          void handleSave()
        }
      }
    }
    globalThis.addEventListener('keydown', handler)
    return () => globalThis.removeEventListener('keydown', handler)
  }, [hasUnsavedChanges, isSaving, uploadingCover, handleSave])

  // ── Ready state ─────────────────────────────────────────────────────────────
  const isReady = isInitialised && !isLoading

  return (
    <div className="flex h-full flex-col">
      {/* Loading */}
      {isLoading && (
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-3 text-zinc-400">
            <svg
              className="h-5 w-5 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span>Loading article content…</span>
          </div>
        </div>
      )}

      {/* Error */}
      {!isLoading && error && (
        <div className="flex flex-1 items-center justify-center px-4">
          <div className="w-full max-w-md rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-6 text-center">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={() => refetch()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-500"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Editor */}
      {isReady && !error && (
        <div className="flex flex-1 flex-col gap-3 overflow-hidden">
          {/* Save-concept bar — unsaved indicator + keyboard hint */}
          <div className="flex items-center justify-end gap-3 text-xs text-zinc-400">
            {hasUnsavedChanges && (
              <span className="inline-flex items-center gap-1 text-xs text-amber-400">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Unsaved
              </span>
            )}
            <span className="font-mono">⌘S to save</span>
          </div>

          {/* Cover image */}
          <div className="shrink-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Cover image
            </p>
            <CoverImageField
              value={coverImage}
              onChange={setCoverImage}
              slug={slug}
              onUploadingChange={setUploadingCover}
              disabled={isSaving}
            />
            <ArticleImagesPanel contentMd={content} disabled={isSaving} />
          </div>

          <MarkdownEditor value={content} onChange={setContent} />

          {/* Action bar */}
          <div className="flex items-center justify-end gap-3 border-t border-zinc-200 dark:border-white/10 pt-3">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 transition-colors hover:text-zinc-900 dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={!hasUnsavedChanges || isSaving || uploadingCover}
              className="inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
