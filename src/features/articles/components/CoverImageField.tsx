import { useCallback, useState } from 'react'
import { uploadCoverImage } from '@/features/articles/lib/upload-cover-image'
import { useToastStore } from '@/lib/stores/toast-store'

interface CoverImageFieldProps {
  /** Current cover image URL, or null when none is set. */
  readonly value: string | null
  /** Called with the new URL after upload, or null when the image is removed. */
  readonly onChange: (url: string | null) => void
  /** Disables the control (e.g. while a parent save is in flight). */
  readonly disabled?: boolean
  /** Notifies the parent while an upload is in progress (to gate Save buttons). */
  readonly onUploadingChange?: (uploading: boolean) => void
}

/** Label text for the dropzone — kept as sequential returns to avoid nested ternaries (S3358). */
function uploadLabel(uploading: boolean, hasImage: boolean): string {
  if (uploading) return 'Uploading…'
  if (hasImage) return 'Click to replace the image (PNG, JPG, WebP)'
  return 'Click to upload an image (PNG, JPG, WebP)'
}

/**
 * Reusable cover-image control: preview, upload (via the presigned-URL media
 * pipeline), and remove. Used by both the article create form and the edit
 * drawer so the two stay in lockstep.
 */
export function CoverImageField({
  value,
  onChange,
  disabled = false,
  onUploadingChange,
}: CoverImageFieldProps) {
  const addToast = useToastStore((s) => s.addToast)
  const [localPreview, setLocalPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const previewSrc = localPreview ?? value

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return

      const objectUrl = URL.createObjectURL(file)
      setLocalPreview(objectUrl)
      setUploading(true)
      onUploadingChange?.(true)

      try {
        const url = await uploadCoverImage(file)
        onChange(url)
      } catch {
        addToast('error', 'Cover image upload failed. Please try again.')
        URL.revokeObjectURL(objectUrl)
        setLocalPreview(null)
      } finally {
        setUploading(false)
        onUploadingChange?.(false)
      }
    },
    [onChange, addToast, onUploadingChange],
  )

  const handleRemove = useCallback(() => {
    if (localPreview) URL.revokeObjectURL(localPreview)
    setLocalPreview(null)
    onChange(null)
  }, [localPreview, onChange])

  return (
    <div className="mt-4">
      {previewSrc && (
        <img
          src={previewSrc}
          alt="Cover preview"
          className="mb-3 h-40 w-full rounded-md object-cover ring-1 ring-zinc-200 dark:ring-white/10"
        />
      )}
      <div className="flex items-center gap-3">
        <label className="flex flex-1 cursor-pointer items-center justify-center rounded-md border border-dashed border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800/50 p-6 text-sm text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          {uploadLabel(uploading, Boolean(previewSrc))}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={handleFileChange}
            disabled={disabled || uploading}
          />
        </label>
        {previewSrc && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={disabled || uploading}
            className="shrink-0 rounded-md px-3 py-2 text-sm font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Remove
          </button>
        )}
      </div>
    </div>
  )
}
