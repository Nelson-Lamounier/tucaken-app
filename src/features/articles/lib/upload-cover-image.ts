import { uploadMediaFn } from '@/server/upload'

/** Upload a cover image via the existing media presign+PUT server fn. Returns the absolute CDN URL. */
export async function uploadCoverImage(file: File): Promise<string> {
  const formData = new FormData()
  formData.append('file', file)
  const result = await uploadMediaFn({ data: formData })
  return result.url
}
