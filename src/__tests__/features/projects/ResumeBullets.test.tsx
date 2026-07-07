/**
 * @vitest-environment happy-dom
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ResumeBullets } from '@/features/projects/components/detail/ResumeBullets'
import type { ProjectResumeBullets } from '@/features/projects/lib/types'

const angles: ProjectResumeBullets[] = [
  { angle: 'backend', bullets: ['Built the API end to end', 'Cut p95 latency 40%'], generated_at: '2026-07-01T00:00:00Z' },
  { angle: 'infrastructure', bullets: ['Ran the EKS platform'], generated_at: '2026-07-01T00:00:00Z' },
]

describe('ResumeBullets — copy to clipboard', () => {
  it('copies the active angle bullets, one per line', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ResumeBullets angles={angles} />)

    await userEvent.click(screen.getByRole('button', { name: /copy bullets/i }))

    expect(writeText).toHaveBeenCalledWith('Built the API end to end\nCut p95 latency 40%')
    expect(await screen.findByText(/copied/i)).toBeTruthy()
  })

  it('copies the newly selected angle after switching chips', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<ResumeBullets angles={angles} />)

    await userEvent.click(screen.getByRole('button', { name: /infrastructure/i }))
    await userEvent.click(screen.getByRole('button', { name: /copy bullets/i }))

    expect(writeText).toHaveBeenCalledWith('Ran the EKS platform')
  })
})
