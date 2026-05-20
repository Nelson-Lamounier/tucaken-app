import { createFileRoute, redirect } from '@tanstack/react-router'
import { HomePage } from '../features/home/HomePage'

export const Route = createFileRoute('/')({
  beforeLoad: ({ context }) => {
    // Authenticated users normally bypass the marketing home and land in the
    // dashboard. Under MOCK_AUTH (VITE_MOCK_AUTH=true, set by `just dev-mock`)
    // we keep the home page reachable so end-to-end UX tests can exercise the
    // PricingSection → /checkout → /checkout/return flow without signing the
    // mock user out first.
    if (!import.meta.env.VITE_MOCK_AUTH && context.auth.user) {
      throw redirect({ to: '/overview' })
    }
  },
  component: HomePage,
})
