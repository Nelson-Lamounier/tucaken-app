import { describe, it, expect, vi, beforeEach } from 'vitest'

const presignMediaUpload = vi.fn()
const deleteMedia = vi.fn()
vi.mock('@/server/upload', () => ({
  presignMediaUploadFn: (...a: unknown[]) => presignMediaUpload(...a),
  deleteMediaFn: (...a: unknown[]) => deleteMedia(...a),
}))

describe('uploadArticleImage', () => {
  beforeEach(() => {
    presignMediaUpload.mockReset()
    deleteMedia.mockReset()
    deleteMedia.mockResolvedValue({ deleted: true })
    vi.unstubAllGlobals()
  })

  it('uploads under the placeholder id regardless of the local filename', async () => {
    presignMediaUpload.mockResolvedValue({
      url: 'https://bkt.s3.eu-west-1.amazonaws.com/images/articles/bff-architecture-hero.png?sig',
      key: 'images/articles/bff-architecture-hero.png',
      publicUrl: 'https://nelsonlamounier.com/images/articles/bff-architecture-hero.png',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const { uploadArticleImage } = await import('@/features/articles/lib/upload-article-image')
    const file = new File([new Uint8Array([1])], 'ChatGPT Image Jul 5.png', { type: 'image/png' })
    const out = await uploadArticleImage(file, 'bff-architecture-hero')
    expect(presignMediaUpload).toHaveBeenCalledWith({
      data: expect.objectContaining({ id: 'bff-architecture-hero', contentType: 'image/png' }),
    })
    expect(out.url).toBe('https://nelsonlamounier.com/images/articles/bff-architecture-hero.png')
  })

  it('deletes sibling extensions so a stale jpeg never shadows the new png', async () => {
    presignMediaUpload.mockResolvedValue({
      url: 'https://bkt/img?sig',
      key: 'images/articles/x.png',
      publicUrl: 'https://nelsonlamounier.com/images/articles/x.png',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
    const { uploadArticleImage } = await import('@/features/articles/lib/upload-article-image')
    await uploadArticleImage(new File([new Uint8Array([1])], 'x.png', { type: 'image/png' }), 'x')
    const deletedKeys = deleteMedia.mock.calls.map((c) => (c[0] as { data: { key: string } }).data.key)
    expect(deletedKeys).toEqual(expect.arrayContaining([
      'images/articles/x.jpeg', 'images/articles/x.jpg', 'images/articles/x.webp', 'images/articles/x.gif',
    ]))
    expect(deletedKeys).not.toContain('images/articles/x.png')
  })
})
