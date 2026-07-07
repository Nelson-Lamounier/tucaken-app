import { describe, it, expect, vi, beforeEach } from 'vitest'

// The upload must NOT route the binary through a server fn: AWS WAF on the
// ALB rejects large request bodies with 403 (verified live 2026-07-06 — a
// 200KB POST to /_serverFn/* returns 403 from awselb/2.0 before reaching the
// pod). Only the small JSON presign request may cross the ALB; the file goes
// browser -> S3 with the presigned URL.
const presignMediaUpload = vi.fn()
const deleteMedia = vi.fn()
vi.mock('@/server/upload', () => ({
  presignMediaUploadFn: (...a: unknown[]) => presignMediaUpload(...a),
  deleteMediaFn: (...a: unknown[]) => deleteMedia(...a),
}))

describe('uploadCoverImage', () => {
  beforeEach(() => {
    presignMediaUpload.mockReset()
    deleteMedia.mockReset()
    deleteMedia.mockResolvedValue({ deleted: true })
    vi.unstubAllGlobals()
  })

  it('presigns under the <slug>-cover id and PUTs the file straight to S3', async () => {
    presignMediaUpload.mockResolvedValue({
      url: 'https://assets-bucket.s3.eu-west-1.amazonaws.com/images/articles/my-slug-cover.png?X-Amz-Signature=abc',
      key: 'images/articles/my-slug-cover.png',
      publicUrl: 'https://nelsonlamounier.com/images/articles/my-slug-cover.png',
    })
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 })
    vi.stubGlobal('fetch', fetchMock)

    const { uploadCoverImage } = await import('@/features/articles/lib/upload-cover-image')
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    const out = await uploadCoverImage(file, 'my-slug')

    // Presigns under the shot-list id, not the local filename.
    expect(presignMediaUpload).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'my-slug-cover', contentType: 'image/png' }),
    })
    // The binary goes directly to the presigned S3 URL from the browser.
    expect(fetchMock).toHaveBeenCalledWith(
      'https://assets-bucket.s3.eu-west-1.amazonaws.com/images/articles/my-slug-cover.png?X-Amz-Signature=abc',
      expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/png' },
        body: file,
      }),
    )
    expect(out).toBe('https://nelsonlamounier.com/images/articles/my-slug-cover.png')
  })

  it('throws when the S3 PUT is rejected', async () => {
    presignMediaUpload.mockResolvedValue({
      url: 'https://assets-bucket.s3.eu-west-1.amazonaws.com/images/articles/x-cover.png?sig',
      key: 'images/articles/x-cover.png',
      publicUrl: 'https://nelsonlamounier.com/images/articles/x-cover.png',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403 }))

    const { uploadCoverImage } = await import('@/features/articles/lib/upload-cover-image')
    const file = new File([new Uint8Array([1])], 'x.png', { type: 'image/png' })
    await expect(uploadCoverImage(file, 'x')).rejects.toThrow('S3 direct upload failed [403]')
  })
})
