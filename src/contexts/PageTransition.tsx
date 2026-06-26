"use client"
// src/contexts/PageTransition.tsx
// Motion+ Curtains page transition, hoisted to the root so the cover survives
// the route change it triggers (the triggering nav lives inside a page that
// unmounts). Exposes transitionTo(path) which wraps router navigation in a
// staggerWipe curtain, holding the cover until the destination route is ready.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCurtains } from 'motion-plus/react'
import { staggerWipe } from 'motion-plus/curtains'

interface PageTransitionValue {
  transitionTo: (to: string) => void
  isPending: boolean
}

const PageTransitionContext = createContext<PageTransitionValue | null>(null)

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [curtains, isPending] = useCurtains()

  const value = useMemo<PageTransitionValue>(
    () => ({
      isPending,
      transitionTo: (to) => {
        void curtains(async () => { await navigate({ to }) }, {
          effect: staggerWipe({ direction: 'down' }),
          transition: { duration: 0.5 },
        })
      },
    }),
    [curtains, isPending, navigate],
  )

  return <PageTransitionContext.Provider value={value}>{children}</PageTransitionContext.Provider>
}

export function usePageTransition(): PageTransitionValue {
  const ctx = useContext(PageTransitionContext)
  if (!ctx) throw new Error('usePageTransition must be used within PageTransitionProvider')
  return ctx
}
