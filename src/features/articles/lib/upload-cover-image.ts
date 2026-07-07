import { uploadArticleImage } from './upload-article-image'

/**
 * Upload a cover image: delegates to {@link uploadArticleImage} against the
 * shot-list id `<slug>-cover`, so the cover follows the same content-address
 * convention (and stale-extension cleanup) as every other article image.
 *
 * The file must not travel through a server fn — AWS WAF on the ALB 403s
 * large request bodies before they reach the pod. The S3 bucket allows CORS
 * PUT from the app origin, and CSP `connect-src` allows `*.amazonaws.com`.
 */
export async function uploadCoverImage(file: File, slug: string): Promise<string> {
  const { url } = await uploadArticleImage(file, `${slug}-cover`)
  return url
}
