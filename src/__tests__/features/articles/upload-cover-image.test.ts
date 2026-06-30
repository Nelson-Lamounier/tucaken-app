import { describe, it, expect, vi, beforeEach } from 'vitest'

const uploadMedia = vi.fn()
vi.mock('@/server/upload', () => ({ uploadMediaFn: (...a: unknown[]) => uploadMedia(...a) }))

describe('uploadCoverImage', () => {
  beforeEach(() => uploadMedia.mockReset())

  it('posts the file via uploadMediaFn and returns the public url', async () => {
    uploadMedia.mockResolvedValue({
      success: true,
      url: 'https://nelsonlamounier.com/articles/cover.png',
      key: 'articles/cover.png',
    })
    const { uploadCoverImage } = await import('@/features/articles/lib/upload-cover-image')
    const file = new File([new Uint8Array([1, 2, 3])], 'cover.png', { type: 'image/png' })
    const out = await uploadCoverImage(file)
    expect(uploadMedia).toHaveBeenCalledWith({ data: expect.any(FormData) })
    expect(out).toBe('https://nelsonlamounier.com/articles/cover.png')
  })
})
