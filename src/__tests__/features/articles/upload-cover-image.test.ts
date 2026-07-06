import { describe, it, expect, vi, beforeEach } from 'vitest'

// The upload must NOT route the binary through a server fn: AWS WAF on the
// ALB rejects large request bodies with 403 (verified live 2026-07-06 — a
// 200KB POST to /_serverFn/* returns 403 from awselb/2.0 before reaching the
// pod). Only the small JSON presign request may cross the ALB; the file goes
// browser -> S3 with the presigned URL.
const presignMediaUpload = vi.fn()
vi.mock('@/server/upload', () => ({
  presignMediaUploadFn: (...a: unknown[]) => presignMediaUpload(...a),
}))

describe('uploadCoverImage', () => {
  beforeEach(() => {
    presignMediaUpload.mockReset()
    vi.unstubAllGlobals()
  })

  it('presigns via JSON metadata and PUTs the file straight to S3', async () => {
    presignMediaUpload.mockResolvedValue({
      url: 'https://assets-bucket.s3.eu-west-1.amazonaws.com/articles/images/articles/cover.png?X-Amz-Signature=abc',
      key: 'articles/images/articles/cover.png',
      publicUrl: 'https://nelsonlamounier.com/articles/images/articles/cover.png',
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const { uploadCoverImage } = await import('@/features/articles/lib/upload-cover-image')
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    const out = await uploadCoverImage(file)

    // Presign carries metadata only — never the file body.
    expect(presignMediaUpload).toHaveBeenCalledWith({
      data: { fileName: 'cover.png', contentType: 'image/png', contentLength: 3 },
    })
    // The binary goes directly to the presigned S3 URL from the browser.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://assets-bucket.s3.eu-west-1.amazonaws.com/articles/images/articles/cover.png?X-Amz-Signature=abc',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      }),
    )
    expect(out).toBe('https://nelsonlamounier.com/articles/images/articles/cover.png')
  })

  it('throws when the S3 PUT is rejected', async () => {
    presignMediaUpload.mockResolvedValue({
      url: 'https://assets-bucket.s3.eu-west-1.amazonaws.com/k?sig',
      key: 'k',
      publicUrl: 'https://nelsonlamounier.com/k',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    const { uploadCoverImage } = await import('@/features/articles/lib/upload-cover-image')
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })
    await expect(uploadCoverImage(file)).rejects.toThrow('S3 direct upload failed [403]')
  })
})
