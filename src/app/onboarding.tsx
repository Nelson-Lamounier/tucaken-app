import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { AlertTriangle } from 'lucide-react'
import { z } from 'zod'
import { OnboardingShell } from '@/features/onboarding/components/onboarding/OnboardingShell'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { handleGitHubInstallFn } from '@/server/github'
import { adminKeys } from '@/lib/api/query-keys'
import { getMeFn } from '@/server/me'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  setup_action:    z.coerce.string().optional(),
  // Step index (0-based) to restore after GitHub redirects back.
  // The callback handler sets this to 3 (connect step) so the user lands there.
  step:            z.coerce.number().min(0).max(5).optional(),
})

export const Route = createFileRoute('/onboarding')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/sign-in' })
  },
  loader: async () => {
    try {
      await getMeFn()
      return { provisioningReady: true as const }
    } catch {
      return { provisioningReady: false as const }
    }
  },
  component: OnboardingPage,
})

// connect step is index 3 in the STEPS array (welcome/portfolio/resume/connect/repos/processing)
const CONNECT_STEP_INDEX = 3

function OnboardingPage() {
  const navigate                         = useNavigate()
  const queryClient                      = useQueryClient()
  const { provisioningReady }            = Route.useLoaderData()
  const { installation_id, step }        = Route.useSearch()
  const { data: installation, isLoading: isLoadingInstallation } = useGitHubInstallation()

  const appSlug = import.meta.env.VITE_GITHUB_APP_SLUG as string | undefined

  // Handle the GitHub App installation callback — same pattern as /settings/github.
  // GitHub redirects here with ?installation_id=...&setup_action=install after the user
  // completes the App installation flow.
  useEffect(() => {
    if (!installation_id) return
    const id = installation_id
    async function handleInstall() {
      try {
        await handleGitHubInstallFn({ data: { installationId: id } })
      } catch {
        // callback error is non-fatal — installation may still have succeeded
      } finally {
        await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
        // Remove installation_id from the URL and land on the connect step.
        void navigate({ to: '/onboarding', replace: true, search: { step: CONNECT_STEP_INDEX } })
      }
    }
    void handleInstall()
  }, [installation_id, navigate, queryClient])

  return (
    <div className="relative">
      {!provisioningReady && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed inset-x-0 top-0 z-50 flex items-center gap-3 border-b border-amber-400/30 bg-amber-400/10 px-4 py-3 text-sm text-amber-400 backdrop-blur-sm"
          style={{ willChange: 'transform, opacity' }}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>
            Backend service is temporarily unavailable — resume upload may not work yet.
            Refresh to retry once the service recovers.
          </span>
        </motion.div>
      )}
      <OnboardingShell
        onConnectGithub={() => {
          // Dev-mock: don't leave the app for github.com — simulate the
          // App-install callback locally so connect → repos → processing
          // is testable offline.
          if (import.meta.env.VITE_MOCK_AUTH === 'true') {
            void (async () => {
              try {
                await handleGitHubInstallFn({ data: { installationId: 'mock-installation' } })
              } finally {
                await queryClient.invalidateQueries({ queryKey: adminKeys.github.installation() })
                void navigate({ to: '/onboarding', replace: true, search: { step: CONNECT_STEP_INDEX } })
              }
            })()
            return
          }
          if (appSlug) {
            // Flag so the settings-page callback handler redirects back to onboarding
            // instead of staying on /settings/github (GitHub App Setup URL is fixed).
            localStorage.setItem('github_install_return', 'onboarding')
            globalThis.location.href = `https://github.com/apps/${appSlug}/installations/new`
          }
        }}
        installation={installation}
        isLoadingInstallation={isLoadingInstallation}
        initialStepIndex={step}
      />
    </div>
  )
}
