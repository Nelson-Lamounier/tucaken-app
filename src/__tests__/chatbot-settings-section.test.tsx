// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

const update = vi.fn()
vi.mock('@/features/account/hooks/use-chatbot-setting', () => ({
  useChatbotSetting: () => ({ enabled: false, isLoading: false, isUpdating: false, update }),
}))

import { ChatbotSettingsSection } from '@/features/account/settings/ChatbotSettingsSection'

describe('ChatbotSettingsSection', () => {
  beforeEach(() => update.mockClear())

  it('renders the toggle off and calls update(true) when clicked', () => {
    render(<ChatbotSettingsSection />)
    const toggle = screen.getByRole('switch', { name: 'Use chatbot' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(update).toHaveBeenCalledWith(true)
  })
})
