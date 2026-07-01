import { createFileRoute } from '@tanstack/react-router'
import { LegalPage } from '@/features/legal/components/LegalPage'
import { termsDoc } from '@/features/legal/content/terms'

export const Route = createFileRoute('/terms')({
  component: () => <LegalPage doc={termsDoc} />,
})
