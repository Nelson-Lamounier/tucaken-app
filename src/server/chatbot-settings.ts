/**
 * Server functions for the admin-only chatbot feature toggle.
 *
 * - getChatbotSettingFn    — reads the owner-scoped chatbot flag from admin-api
 * - updateChatbotSettingFn — persists it via admin-api
 *
 * SECURITY: both require the admin role server-side via requireAdmin — never
 * rely on the client-side UI gate. The admin-api route is itself owner-scoped
 * (reads/writes the portfolio owner's users.chatbot_enabled) and admin-guarded.
 */

import { z } from 'zod'
import { createServerFn } from '@tanstack/react-start'
import { apiFetch } from './_api-client'
import { requireAdmin } from './auth-guard'

export const ChatbotSettingSchema = z.object({ chatbotEnabled: z.boolean() })

export const getChatbotSettingFn = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{ chatbotEnabled: boolean }> => {
    await requireAdmin()
    return apiFetch<{ chatbotEnabled: boolean }>('/settings/chatbot', {
      pathTemplate: '/settings/chatbot',
    })
  },
)

export const updateChatbotSettingFn = createServerFn({ method: 'POST' })
  .inputValidator(ChatbotSettingSchema)
  .handler(async ({ data }): Promise<{ ok: true; updated: boolean }> => {
    await requireAdmin()
    return apiFetch<{ ok: true; updated: boolean }>('/settings/chatbot', {
      method: 'PATCH',
      pathTemplate: '/settings/chatbot',
      body: JSON.stringify(data),
      headers: { 'Content-Type': 'application/json' },
    })
  })
