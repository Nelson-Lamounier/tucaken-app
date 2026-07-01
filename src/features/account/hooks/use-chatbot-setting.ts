import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { adminKeys } from '@/lib/api/query-keys'
import { getChatbotSettingFn, updateChatbotSettingFn } from '@/server/chatbot-settings'

/**
 * Admin-only hook for the owner-scoped chatbot feature toggle. Reads and
 * persists `chatbot_enabled` via the admin-api settings endpoint, invalidating
 * the cached value on a successful write.
 */
export function useChatbotSetting() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: adminKeys.settings.chatbot(),
    queryFn: () => getChatbotSettingFn(),
  })

  const mutation = useMutation({
    mutationFn: (chatbotEnabled: boolean) => updateChatbotSettingFn({ data: { chatbotEnabled } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.settings.chatbot() })
    },
  })

  return {
    enabled: query.data?.chatbotEnabled ?? false,
    isLoading: query.isLoading,
    isUpdating: mutation.isPending,
    update: mutation.mutate,
  }
}
