"use client"
// src/contexts/PageTransition.tsx
// Motion+ Curtains page transition, hoisted to the root so the cover survives
// the route change it triggers (the triggering nav lives inside a page that
// unmounts). Exposes transitionTo(target) which wraps router navigation in a
// staggerWipe curtain, holding the cover until the destination route is ready.
// `target` is whatever useNavigate accepts — a path or a { to, params } object.
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useCurtains } from 'motion-plus/react'
import { staggerWipe } from 'motion-plus/curtains'

// transitionTo mirrors useNavigate's full (generic) signature so call sites get
// the same type-safety/inference as navigate — a path string or a typed
// { to, params } object both work.
type NavigateFn = ReturnType<typeof useNavigate>

interface PageTransitionValue {
  transitionTo: NavigateFn
  isPending: boolean
}

const PageTransitionContext = createContext<PageTransitionValue | null>(null)

export function PageTransitionProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const [curtains, isPending] = useCurtains()

  const value = useMemo<PageTransitionValue>(() => {
    const transitionTo = ((...args: Parameters<NavigateFn>) =>
      curtains(async () => { await navigate(...args) }, {
        effect: staggerWipe({ direction: 'down' }),
        transition: { duration: 0.5 },
      })) as NavigateFn
    return { isPending, transitionTo }
  }, [curtains, isPending, navigate])

  return <PageTransitionContext.Provider value={value}>{children}</PageTransitionContext.Provider>
}

export function usePageTransition(): PageTransitionValue {
  const ctx = useContext(PageTransitionContext)
  if (!ctx) throw new Error('usePageTransition must be used within PageTransitionProvider')
  return ctx
}
