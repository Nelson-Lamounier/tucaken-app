import { presignMediaUploadFn } from '@/server/upload'

/**
 * Upload a cover image: presign via a metadata-only server fn, then PUT the
 * binary straight from the browser to S3. Returns the absolute CDN URL.
 *
 * The file must not travel through the server fn — AWS WAF on the ALB 403s
 * large request bodies before they reach the pod. The S3 bucket allows CORS
 * PUT from the app origin, and CSP `connect-src` allows `*.amazonaws.com`.
 */
export async function uploadCoverImage(file: File): Promise<string> {
  const presign = await presignMediaUploadFn({
    data: { fileName: file.name, contentType: file.type, contentLength: file.size },
  })

  const res = await fetch(presign.url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  })
  if (!res.ok) {
    throw new Error(`S3 direct upload failed [${res.status}]`)
  }

  return presign.publicUrl
}
