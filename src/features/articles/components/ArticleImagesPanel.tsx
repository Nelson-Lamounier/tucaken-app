import { useCallback, useMemo, useState } from 'react'
import { uploadArticleImage } from '@/features/articles/lib/upload-article-image'
import { parseImageRequests } from '@/features/articles/lib/parse-image-requests'
import { useToastStore } from '@/lib/stores/toast-store'

const SITE_BASE = 'https://nelsonlamounier.com/images/articles'
const PROBE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp', 'gif'] as const

interface SlotProps {
  readonly id: string
  readonly instruction: string
  readonly disabled: boolean
}

/** Slot button text — sequential returns to avoid a nested ternary (S3358). */
function slotLabel(uploading: boolean, hasImage: boolean): string {
  if (uploading) return 'Uploading…'
  if (hasImage) return 'Replace image'
  return 'Upload image'
}

/** One upload slot per shot-list placeholder. Preview probes the live site URL with the same extension fallback the portfolio uses. */
function ImageSlot({ id, instruction, disabled }: SlotProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [uploading, setUploading] = useState(false)
  const [extIndex, setExtIndex] = useState(0)
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  const probeSrc = `${SITE_BASE}/${id}.${PROBE_EXTENSIONS[extIndex]}`

  const handleProbeError = useCallback(() => {
    if (extIndex < PROBE_EXTENSIONS.length - 1) setExtIndex(extIndex + 1)
    else setMissing(true)
  }, [extIndex])

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const { url } = await uploadArticleImage(file, id)
        setResolvedUrl(`${url}?v=${Date.now()}`)
        setMissing(false)
        addToast('success', `Image for "${id}" uploaded.`)
      } catch {
        addToast('error', `Upload for "${id}" failed. Please try again.`)
      } finally {
        setUploading(false)
      }
    },
    [id, addToast],
  )

  const previewSrc = resolvedUrl ?? (missing ? null : probeSrc)

  return (
    <li className="rounded-md border border-zinc-200 dark:border-white/10 p-3">
      <p className="text-sm font-medium">{id}</p>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{instruction}</p>
      {previewSrc && (
        <img
          src={previewSrc}
          alt={`Current image for ${id}`}
          onError={resolvedUrl ? undefined : handleProbeError}
          className="mt-2 h-28 w-full rounded-md object-cover ring-1 ring-zinc-200 dark:ring-white/10"
        />
      )}
      {!previewSrc && (
        <p className="mt-2 rounded-md bg-amber-50 dark:bg-amber-900/20 p-2 text-xs text-amber-700 dark:text-amber-400">
          No image uploaded yet — the article shows a placeholder card.
        </p>
      )}
      <label className="mt-2 inline-flex cursor-pointer items-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
        {slotLabel(uploading, Boolean(previewSrc))}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleFileChange}
          disabled={disabled || uploading}
        />
      </label>
    </li>
  )
}

interface ArticleImagesPanelProps {
  readonly contentMd: string
  readonly disabled?: boolean
}

/** Upload slots for every <ImageRequest/> placeholder the pipeline emitted. */
export function ArticleImagesPanel({ contentMd, disabled = false }: ArticleImagesPanelProps) {
  const placeholders = useMemo(() => parseImageRequests(contentMd), [contentMd])
  if (placeholders.length === 0) return null
  return (
    <section className="mt-6">
      <h3 className="text-sm font-semibold">Article images</h3>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        One slot per placeholder the writer emitted. Uploads go live on the article within seconds.
      </p>
      <ul className="mt-3 space-y-3">
        {placeholders.map((p) => (
          <ImageSlot key={p.id} id={p.id} instruction={p.instruction} disabled={disabled} />
        ))}
      </ul>
    </section>
  )
}
