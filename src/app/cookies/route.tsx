import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { cookiesDoc } from '@/features/legal/content/cookies'

export const Route = createFileRoute('/cookies')({
  component: () => <LegalPage doc={cookiesDoc} />,
})
