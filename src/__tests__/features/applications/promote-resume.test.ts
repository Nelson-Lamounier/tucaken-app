import { describe, it, expect, vi } from 'vitest'
import { resolveResumeId } from '@/features/applications/utils/promote-resume'

describe('resolveResumeId', () => {
  it('reuses an existing resume with the matching label', async () => {
    const getResumes = vi.fn().mockResolvedValue([{ resumeId: 'r1', label: 'Acme — Dev' }])
    const createResume = vi.fn()
    const id = await resolveResumeId({ label: 'Acme — Dev', data: {} as never }, getResumes, createResume)
    expect(id).toBe('r1')
    expect(createResume).not.toHaveBeenCalled()
  })
  it('creates a new resume when no label matches', async () => {
    const getResumes = vi.fn().mockResolvedValue([])
    const createResume = vi.fn().mockResolvedValue({ resumeId: 'r2' })
    const id = await resolveResumeId({ label: 'New — Role', data: {} as never }, getResumes, createResume)
    expect(id).toBe('r2')
    expect(createResume).toHaveBeenCalledOnce()
  })
})
