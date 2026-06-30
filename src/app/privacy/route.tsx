import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { privacyDoc } from '@/features/legal/content/privacy'

export const Route = createFileRoute('/privacy')({
  component: () => <LegalPage doc={privacyDoc} />,
})
