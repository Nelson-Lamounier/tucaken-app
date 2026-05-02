import { createFileRoute, redirect } from '@tanstack/react-router'
import { z } from 'zod'
import { handleAuthCallbackFn } from '../server/auth'

const callbackSearchSchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
})

export const Route = createFileRoute('/sign-in/callback')({
  validateSearch: callbackSearchSchema,
  beforeLoad: async ({ search }) => {
    if (search.error) {
      throw redirect({ to: '/sign-in' })
    }

    if (!search.code) {
      throw redirect({ to: '/sign-in' })
    }

    if (!search.state) {
      throw redirect({ to: '/sign-in' })
    }

    try {
      await handleAuthCallbackFn({ data: { code: search.code, state: search.state } })
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        ('status' in err || 'redirect' in err || 'name' in err)
      ) {
        const errObj = err as Record<string, unknown>
        if (
          errObj.status === 307 ||
          errObj.status === 302 ||
          errObj.name === 'RedirectError' ||
          'redirect' in errObj
        ) {
          throw err
        }
      }
      throw redirect({ to: '/sign-in' })
    }

    if (typeof window !== 'undefined') {
      globalThis.window.location.href = '/overview'
      await new Promise<void>(() => {})
    }
    throw redirect({ to: '/overview' })
  },
  component: () => (
    <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-white">
      <div className="flex flex-col items-center gap-4">
        <div className="size-8 animate-spin rounded-full border-4 border-teal-500 border-t-transparent" />
        <p className="text-zinc-400">Authenticating...</p>
      </div>
    </div>
  ),
})
