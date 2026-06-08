/** @vitest-environment happy-dom */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FinalChecklist } from '@/features/applications/stages/components/FinalChecklist'

const ITEMS = [
  'Rails API project on GitHub (CRUD, validation, tests)',
  '3 system design practice questions documented',
  '5 LeetCode Medium problems completed',
]
const NOTE = 'You are well-positioned for this round.'

beforeEach(() => globalThis.localStorage.clear())

describe('FinalChecklist', () => {
  it('renders the structured items + note and starts at 0%', () => {
    render(<FinalChecklist slug="acme" stage="technical" items={ITEMS} note={NOTE} />)
    expect(screen.getByText(/Rails API project on GitHub/)).toBeTruthy()
    expect(screen.getByText(/5 LeetCode Medium problems completed/)).toBeTruthy()
    expect(screen.getByText(/You are well-positioned/)).toBeTruthy()
    expect(screen.getByText('0 of 3 done')).toBeTruthy()
  })

  it('toggles an item, updates progress, and persists to localStorage', () => {
    render(<FinalChecklist slug="acme" stage="technical" items={ITEMS} />)
    fireEvent.click(screen.getByText(/Rails API project on GitHub/).closest('button') as HTMLElement)
    expect(screen.getByText('1 of 3 done')).toBeTruthy()
    const stored = globalThis.localStorage.getItem('finalcheck:acme:technical')
    expect(stored).toContain('Rails API project on GitHub')
  })

  it('hydrates checked state from localStorage on mount', () => {
    globalThis.localStorage.setItem(
      'finalcheck:acme:technical',
      JSON.stringify(['3 system design practice questions documented']),
    )
    render(<FinalChecklist slug="acme" stage="technical" items={ITEMS} />)
    expect(screen.getByText('1 of 3 done')).toBeTruthy()
  })
})
