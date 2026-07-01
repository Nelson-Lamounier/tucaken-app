import { Card, Row, Toggle } from '../components/primitives'
import { useChatbotSetting } from '../hooks/use-chatbot-setting'

/**
 * Admin-only "Use chatbot" toggle. Owner-scoped server-side: it flips the
 * portfolio owner's `chatbot_enabled` flag, which the ingestion pipeline reads
 * before emitting lifecycle chunks. Render only inside the admin-gated section.
 */
export function ChatbotSettingsSection() {
  const { enabled, isUpdating, update } = useChatbotSetting()

  return (
    <Card>
      <Row
        title="Use chatbot"
        sub="Enable the portfolio chatbot and its lifecycle extraction. When off, ingestion skips chatbot-only processing."
        action={
          <Toggle
            checked={enabled}
            onChange={(v) => {
              if (!isUpdating) update(v)
            }}
            label="Use chatbot"
          />
        }
      />
    </Card>
  )
}
