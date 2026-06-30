import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { Button } from '@/components/ui/Button'
import { FormTextarea, FieldInfo } from '@/components/ui/Field'
import { MarkdownEditor } from './MarkdownEditor'
import { deriveSlug } from '@/features/articles/lib/derive-slug'
import { createArticleFn, checkSlugAvailableFn } from '@/server/articles'
import { uploadCoverImage } from '@/features/articles/lib/upload-cover-image'
import { useToastStore } from '@/lib/stores/toast-store'

// =============================================================================
// Constants
// =============================================================================

const DESTINATIONS = [
  { id: 'portfolio', label: 'Personal portfolio' },
  { id: 'tucaken', label: 'Tucaken' },
] as const

type DestinationId = (typeof DESTINATIONS)[number]['id']

const DESTINATION_IDS = new Set<string>(DESTINATIONS.map((d) => d.id))

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/

// =============================================================================
// Schema
// =============================================================================

const articleSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .regex(SLUG_REGEX, 'Slug must be lowercase alphanumeric with hyphens'),
  excerpt: z.string(),
  tags: z.array(z.string()),
  destinations: z
    .array(z.string())
    .min(1, 'Select at least one destination'),
  coverImage: z.string(),
  contentMd: z.string().min(1, 'Content is required'),
})

// =============================================================================
// Component
// =============================================================================

export function ArticleBuilder() {
  const navigate = useNavigate()
  const addToast = useToastStore((s) => s.addToast)

  const [slugUnavailable, setSlugUnavailable] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [coverPreview, setCoverPreview] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const slugCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const slugManuallyEdited = useRef(false)

  const form = useForm({
    defaultValues: {
      title: '',
      slug: '',
      excerpt: '',
      tags: [] as string[],
      destinations: ['portfolio'] as string[],
      coverImage: '',
      contentMd: '',
    },
    onSubmit: async () => {
      // Submission is handled by the Save draft / Publish now action buttons.
    },
  })

  // ---------------------------------------------------------------------------
  // Slug availability check (debounced 400 ms)
  // ---------------------------------------------------------------------------

  const checkSlug = useCallback(
    (slug: string) => {
      if (slugCheckTimerRef.current !== null) {
        clearTimeout(slugCheckTimerRef.current)
      }
      if (slug.length < 2) return
      slugCheckTimerRef.current = setTimeout(async () => {
        try {
          const result = await checkSlugAvailableFn({ data: slug })
          setSlugUnavailable(!result.available)
        } catch {
          // Non-blocking — leave current availability state
        }
      }, 400)
    },
    [],
  )

  // ---------------------------------------------------------------------------
  // Slug derivation — auto-fills slug from title
  // ---------------------------------------------------------------------------

  const handleTitleChange = useCallback(
    (value: string) => {
      form.setFieldValue('title', value)
      if (!slugManuallyEdited.current) {
        const derived = deriveSlug(value)
        form.setFieldValue('slug', derived)
        setSlugUnavailable(false)
        checkSlug(derived)
      } else {
        setSlugUnavailable(false)
      }
    },
    [form, checkSlug],
  )

  const handleSlugChange = useCallback(
    (value: string) => {
      slugManuallyEdited.current = true
      form.setFieldValue('slug', value)
      setSlugUnavailable(false)
      checkSlug(value)
    },
    [form, checkSlug],
  )

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (slugCheckTimerRef.current !== null) {
        clearTimeout(slugCheckTimerRef.current)
      }
    }
  }, [])

  // ---------------------------------------------------------------------------
  // Cover image upload
  // ---------------------------------------------------------------------------

  const handleCoverImageChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      setCoverPreview(URL.createObjectURL(file))
      setUploadingCover(true)

      try {
        const url = await uploadCoverImage(file)
        form.setFieldValue('coverImage', url)
      } catch {
        addToast('error', 'Cover image upload failed. Please try again.')
        setCoverPreview(null)
      } finally {
        setUploadingCover(false)
      }
    },
    [form, addToast],
  )

  // ---------------------------------------------------------------------------
  // Tag input
  // ---------------------------------------------------------------------------

  const commitTag = useCallback(
    (raw: string) => {
      const tag = raw.trim()
      if (!tag) return
      const current = form.getFieldValue('tags')
      if (!current.includes(tag)) {
        form.setFieldValue('tags', [...current, tag])
      }
      setTagInput('')
    },
    [form],
  )

  const handleTagKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault()
        commitTag(tagInput)
      }
    },
    [tagInput, commitTag],
  )

  const removeTag = useCallback(
    (tag: string) => {
      const current = form.getFieldValue('tags')
      form.setFieldValue('tags', current.filter((t) => t !== tag))
    },
    [form],
  )

  // ---------------------------------------------------------------------------
  // Destination toggle
  // ---------------------------------------------------------------------------

  const toggleDestination = useCallback(
    (id: string) => {
      if (!DESTINATION_IDS.has(id)) return
      const current = form.getFieldValue('destinations')
      const next = current.includes(id) ? current.filter((d) => d !== id) : [...current, id]
      form.setFieldValue('destinations', next)
    },
    [form],
  )

  // ---------------------------------------------------------------------------
  // Submit handler
  // ---------------------------------------------------------------------------

  const handleSubmit = useCallback(
    async (status: 'draft' | 'published') => {
      const values = form.state.values

      // Guard: validate with zod before calling server
      const parsed = articleSchema.safeParse(values)
      if (!parsed.success) {
        addToast('error', 'Please fix the form errors before submitting.')
        return
      }

      if (slugUnavailable) {
        addToast('error', 'Slug is already taken — please choose a different one.')
        return
      }

      const destinations = parsed.data.destinations.filter((d): d is DestinationId =>
        DESTINATION_IDS.has(d),
      )

      setSubmitting(true)
      try {
        await createArticleFn({
          data: {
            slug: parsed.data.slug,
            title: parsed.data.title,
            excerpt: parsed.data.excerpt || undefined,
            contentMd: parsed.data.contentMd,
            tags: parsed.data.tags,
            destinations,
            coverImage: parsed.data.coverImage || undefined,
            status,
          },
        })

        addToast('success', status === 'draft' ? 'Draft saved successfully.' : 'Article published successfully.')
        await navigate({ to: '/articles' })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'An unexpected error occurred.'
        addToast('error', msg)
      } finally {
        setSubmitting(false)
      }
    },
    [form, slugUnavailable, addToast, navigate],
  )

  // ---------------------------------------------------------------------------
  // Derived state for submit gating
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <form
      onSubmit={(e) => e.preventDefault()}
      className="space-y-8 px-4 pb-12 sm:px-6"
    >
      {/* ── Title ─────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-white/10 pb-8">
        <h2 className="text-base/7 font-semibold text-zinc-900 dark:text-white">Article details</h2>
        <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
          Basic metadata for the article.
        </p>
        <div className="mt-6 space-y-4">
          <form.Field
            name="title"
            children={(field) => (
              <div>
                <label
                  htmlFor="article-title"
                  className="block text-sm/6 font-medium text-zinc-700 dark:text-zinc-200"
                >
                  Title
                </label>
                <div className="mt-2">
                  <input
                    id="article-title"
                    name="title"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => handleTitleChange(e.target.value)}
                    placeholder="e.g. Building a GraphQL API with Node.js"
                    className="p-2 block w-full rounded-md border-0 bg-zinc-100 dark:bg-zinc-800 py-1.5 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 focus:ring-2 focus:ring-inset focus:ring-teal-500 sm:text-sm/6 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                </div>
                <FieldInfo field={field} />
              </div>
            )}
          />

          <form.Field
            name="slug"
            children={(field) => (
              <div>
                <label
                  htmlFor="article-slug"
                  className="block text-sm/6 font-medium text-zinc-700 dark:text-zinc-200"
                >
                  Slug
                </label>
                <div className="mt-2">
                  <input
                    id="article-slug"
                    name="slug"
                    value={field.state.value}
                    onBlur={field.handleBlur}
                    onChange={(e) => handleSlugChange(e.target.value)}
                    placeholder="e.g. building-a-graphql-api"
                    className="p-2 block w-full rounded-md border-0 bg-zinc-100 dark:bg-zinc-800 py-1.5 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 focus:ring-2 focus:ring-inset focus:ring-teal-500 sm:text-sm/6 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                  />
                </div>
                <FieldInfo field={field} />
                {slugUnavailable && (
                  <em className="text-xs text-red-500 mt-1 block">
                    This slug is already taken — please choose a different one.
                  </em>
                )}
              </div>
            )}
          />

          <form.Field
            name="excerpt"
            children={(field) => (
              <FormTextarea
                label="Excerpt"
                field={field}
                rows={3}
                placeholder="Brief summary shown in article listings…"
              />
            )}
          />
        </div>
      </div>

      {/* ── Tags ──────────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-white/10 pb-8">
        <h2 className="text-base/7 font-semibold text-zinc-900 dark:text-white">Tags</h2>
        <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
          Press Enter or comma to add a tag.
        </p>
        <form.Field
          name="tags"
          children={(field) => (
            <div className="mt-4">
              <div className="flex flex-wrap gap-2 mb-2">
                {field.state.value.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-md bg-teal-50 dark:bg-teal-900/30 px-2 py-1 text-xs font-medium text-teal-700 dark:text-teal-300 ring-1 ring-inset ring-teal-600/20"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="ml-0.5 text-teal-500 hover:text-teal-700 dark:hover:text-teal-100"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                onBlur={() => commitTag(tagInput)}
                placeholder="Add a tag…"
                className="p-2 block w-full rounded-md border-0 bg-zinc-100 dark:bg-zinc-800 py-1.5 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 focus:ring-2 focus:ring-inset focus:ring-teal-500 sm:text-sm/6 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
              />
            </div>
          )}
        />
      </div>

      {/* ── Destinations ──────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-white/10 pb-8">
        <h2 className="text-base/7 font-semibold text-zinc-900 dark:text-white">Destinations</h2>
        <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
          Choose where to publish this article. At least one destination is required.
        </p>
        <form.Subscribe
          selector={(state) => state.values.destinations}
          children={(destinations) => (
            <div className="mt-4 space-y-3">
              {DESTINATIONS.map((dest) => (
                <label key={dest.id} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={destinations.includes(dest.id)}
                    onChange={() => toggleDestination(dest.id)}
                    className="size-4 rounded border-zinc-300 dark:border-zinc-600 text-teal-600 focus:ring-teal-500"
                  />
                  <span className="text-sm text-zinc-700 dark:text-zinc-200">{dest.label}</span>
                </label>
              ))}
              {destinations.length === 0 && (
                <em className="text-xs text-red-500 block">Select at least one destination</em>
              )}
            </div>
          )}
        />
      </div>

      {/* ── Cover image ───────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-white/10 pb-8">
        <h2 className="text-base/7 font-semibold text-zinc-900 dark:text-white">Cover image</h2>
        <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
          Optional cover image displayed at the top of the article.
        </p>
        <div className="mt-4">
          {coverPreview && (
            <img
              src={coverPreview}
              alt="Cover preview"
              className="mb-3 h-40 w-full rounded-md object-cover ring-1 ring-zinc-200 dark:ring-white/10"
            />
          )}
          <label className="flex cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50 p-6 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
            {uploadingCover ? 'Uploading…' : 'Click to upload an image (PNG, JPG, WebP)'}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleCoverImageChange}
              disabled={uploadingCover}
            />
          </label>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-white/10 pb-8">
        <h2 className="text-base/7 font-semibold text-zinc-900 dark:text-white">Content</h2>
        <p className="mt-1 text-sm/6 text-zinc-500 dark:text-zinc-400">
          Write the article body in Markdown / MDX.
        </p>
        <form.Field
          name="contentMd"
          children={(field) => (
            <div className="mt-4 h-125 flex flex-col">
              <MarkdownEditor
                value={field.state.value}
                onChange={(v) => field.handleChange(v)}
              />
              <FieldInfo field={field} />
            </div>
          )}
        />
      </div>

      {/* ── Actions ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-x-4 pt-4">
        <form.Subscribe
          selector={(state) => state.values}
          children={(values) => {
            const isInvalid =
              !values.title.trim() ||
              !SLUG_REGEX.test(values.slug) ||
              !values.contentMd.trim() ||
              values.destinations.length === 0 ||
              slugUnavailable
            return (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={isInvalid || submitting || uploadingCover}
                  onClick={() => handleSubmit('draft')}
                >
                  {submitting ? 'Saving…' : 'Save draft'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={isInvalid || submitting || uploadingCover}
                  onClick={() => handleSubmit('published')}
                  className="px-6 py-2"
                >
                  {submitting ? 'Publishing…' : 'Publish now'}
                </Button>
              </>
            )
          }}
        />
      </div>
    </form>
  )
}
