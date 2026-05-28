// src/app/github.callback.tsx
//
// Dedicated GitHub App install callback. GitHub's App "Setup URL" points
// here (https://<app-domain>/github/callback). It owns the post-install
// handoff so neither /settings/github nor /onboarding has to: register the
// installation, wait until the (eventually-consistent) admin-api can serve
// it, then return the user where they started — onboarding CONNECT step or
// the settings repositories tab — coordinated via localStorage because the
// Setup URL is a single fixed value with no per-request return param.

import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { handleGitHubInstallFn, getGitHubInstallationFn } from '@/server/github'
import { CONNECT_STEP_INDEX } from '@/features/onboarding/components/onboarding/types'
import { adminKeys } from '@/lib/api/query-keys'
import { useToastStore } from '@/lib/stores/toast-store'

const searchSchema = z.object({
  installation_id: z.coerce.string().optional(),
  // GitHub appends setup_action=install|update — accepted, not used.
  setup_action:    z.coerce.string().optional(),
})

export const Route = createFileRoute('/github/callback')({
  validateSearch: searchSchema,
  beforeLoad: async ({ context }) => {
    if (!context.auth.user) throw redirect({ to: '/sign-in' })
  },
  component: GitHubCallbackPage,
})

function GitHubCallbackPage() {
  const navigate    = useNavigate()
  const queryClient = useQueryClient()
  const { installation_id } = Route.useSearch()
  const { addToast } = useToastStore()

  useEffect(() => {
    const id = installation_id
    async function handleInstall() {
      try {
        if (id) await handleGitHubInstallFn({ data: { installationId: id } })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'GitHub installation failed'
        addToast('error', `GitHub connect failed: ${msg}`)
      } finally {
        // admin-api is eventually consistent: right after the install POST a
        // GET /github/installation can still 404 (mapped to null) until the
        // record is enriched. Poll until present (bounded) and SEED THE CACHE
        // via fetchQuery so the destination reads a warm, non-null
        // installation — no "No installation found" flash, no sticky null.
        if (id) {
          for (let i = 0; i < 6; i++) {
            const inst = await queryClient.fetchQuery({
              queryKey: adminKeys.github.installation(),
              queryFn:  () => getGitHubInstallationFn(),
              staleTime: 0,
            })
            if (inst) break
            await new Promise((r) => setTimeout(r, 1500))
          }
        }
        const returnTo = localStorage.getItem('github_install_return')
        localStorage.removeItem('github_install_return')
        if (returnTo === 'onboarding') {
          // CONNECT step shows the connected account + Continue, not
          // straight into repo selection.
          void navigate({ to: '/onboarding', replace: true, search: { step: CONNECT_STEP_INDEX } })
        } else {
          void navigate({ to: '/settings/github', replace: true, search: { tab: 'repositories' } })
        }
      }
    }
    void handleInstall()
  }, [installation_id, navigate, queryClient, addToast])

  return (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="size-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
        <p className="text-zinc-400">Connecting GitHub…</p>
      </div>
    </div>
  )
}
