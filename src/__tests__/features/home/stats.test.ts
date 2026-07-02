import { describe, expect, it } from 'vitest'
import { resolveDisplayStats } from '@/features/home/lib/stats'
import { liveStats, staticStats } from '@/features/home/content'

function floorFor(key: 'users' | 'resumes'): number {
  const stat = liveStats.find((s) => s.key === key)
  if (!stat) throw new Error(`missing liveStats entry for ${key}`)
  return stat.floor
}

const USERS_FLOOR = floorFor('users')
const RESUMES_FLOOR = floorFor('resumes')
const STATIC_LABELS = staticStats.map((s) => s.label)

describe('resolveDisplayStats', () => {
  it('shows only the static claim(s) when live data is missing (loading / unreachable)', () => {
    const result = resolveDisplayStats(undefined)
    expect(result.map((s) => s.label)).toEqual(STATIC_LABELS)
  })

  it('hides both live figures while their counts are below floor', () => {
    const result = resolveDisplayStats({ users: USERS_FLOOR - 1, resumes: RESUMES_FLOOR - 1 })
    expect(result.map((s) => s.label)).toEqual(STATIC_LABELS)
  })

  it('reveals a live figure exactly at its floor (>= boundary)', () => {
    const result = resolveDisplayStats({ users: USERS_FLOOR, resumes: RESUMES_FLOOR - 1 })
    const users = result.find((s) => s.label === 'Developers trust Tucaken')
    expect(users?.value).toBe(USERS_FLOOR)
    expect(result.some((s) => s.label === 'Resumes generated')).toBe(false)
  })

  it('shows both live figures plus the static claim once both clear their floors', () => {
    const result = resolveDisplayStats({ users: 1200, resumes: 8000 })
    expect(result.map((s) => s.label)).toEqual([
      'Developers trust Tucaken',
      'Resumes generated',
      ...STATIC_LABELS,
    ])
    expect(result.find((s) => s.label === 'Resumes generated')?.value).toBe(8000)
  })

  it('keeps the 80% time-saving claim as a static, always-present figure', () => {
    const result = resolveDisplayStats({ users: 1200, resumes: 8000 })
    const claim = result.find((s) => s.suffix === '%')
    expect(claim?.value).toBe(80)
  })
})
