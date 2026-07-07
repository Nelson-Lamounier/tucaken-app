import { presignMediaUploadFn, deleteMediaFn } from '@/server/upload'

const IMAGE_EXTENSIONS = ['jpeg', 'jpg', 'png', 'webp', 'gif'] as const

function extensionOf(contentType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpeg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
  }
  const ext = map[contentType]
  if (!ext) throw new Error(`Unsupported image type: ${contentType}`)
  return ext
}

/**
 * Upload an image against a shot-list placeholder id. The local filename is
 * irrelevant — the S3 key is images/articles/<id>.<ext>, which is exactly
 * what the portfolio's ImageRequest component probes. After a successful
 * PUT, sibling extensions of the same id are deleted (best-effort) so a
 * stale jpeg never shadows a new png in the client's probe order.
 */
export async function uploadArticleImage(
  file: File,
  id: string,
): Promise<{ url: string; ext: string }> {
  const ext = extensionOf(file.type)
  const presign = await presignMediaUploadFn({
    data: { fileName: file.name, contentType: file.type, contentLength: file.size, id },
  })
  const res = await fetch(presign.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) throw new Error(`S3 direct upload failed [${res.status}]`)

  const stale = IMAGE_EXTENSIONS.filter((e) => e !== ext)
  await Promise.allSettled(
    stale.map((e) => deleteMediaFn({ data: { key: `images/articles/${id}.${e}` } })),
  )
  return { url: presign.publicUrl, ext }
}
