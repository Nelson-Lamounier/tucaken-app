import { HeadContent, Scripts, createRootRouteWithContext, Outlet, Link } from '@tanstack/react-router'
import { MotionConfig } from 'motion/react'
// Side-effect import: tells Vite/Tailwind to process and emit styles.css.
// We do NOT use ?url here — that would trigger Vite's hash-based URL resolution
// which differs between the client and SSR builds (cross-process hash mismatch).
// Instead we reference a fixed path that our copyStylesFixedName plugin ensures
// exists on disk after the client build (see vite.config.ts).
import '../styles.css'
const appCss = `${import.meta.env.BASE_URL ?? '/'}assets/styles.css`
import { QueryClientProvider } from '@tanstack/react-query'
import type { RouterContext } from '../router'
import { getUserSessionFn } from '../server/session'
import { Toaster } from '../components/ui/Toaster'
import { ThemeProvider } from '../contexts/ThemeContext'
import { PageTransitionProvider } from '../contexts/PageTransition'
import { LoadingOverlay } from '../components/LoadingOverlay'
import { queryClient } from '../lib/query-client'
import { ConsentEffects } from '../features/consent/ConsentEffects'
import { ConsentBanner } from '../features/consent/components/ConsentBanner'
import { ConsentPreferences } from '../features/consent/components/ConsentPreferences'
import { usePreferencesUiStore } from '../features/consent/store-ui'

/**
 * Inline script injected into <head> before first paint.
 * Reads `localStorage` and applies `.dark` to `<html>` synchronously,
 * preventing a flash of unstyled (light) content on dark-mode reload.
 * Defaults to `dark` if no preference is stored.
 */
const ANTI_FLASH_SCRIPT = `
(function() {
  var stored = null;
  try {
    stored = localStorage.getItem('tucaken-app-theme');
    // Fall back to legacy key from the start-admin era so the first paint
    // still respects an existing preference. ThemeContext migrates on next
    // mount; this script stays read-only to avoid races.
    if (stored === null) {
      stored = localStorage.getItem('start-admin-theme');
    }
  } catch (e) {}
  var isDark = stored === null ? true : stored !== 'light';
  if (isDark) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
})();
`

export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const user = await getUserSessionFn()
    return { auth: { user } }
  },
  head: () => ({
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1',
      },
      {
        title: 'Portfolio Admin',
      },
    ],
    links: [
      {
        rel: 'stylesheet',
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
  errorComponent: ErrorComponent,
  notFoundComponent: NotFoundComponent,
  component: RootComponent,
})

function ErrorComponent({ error }: { error: unknown }) {
  // Stack traces and raw error payloads can leak internal paths, env, and
  // dependency versions. Show them only in dev; production gets a generic
  // message so nothing sensitive reaches the browser.
  const isDev = import.meta.env.DEV

  return (
    <RootDocument>
      <div className="p-4 bg-red-50 dark:bg-red-950 text-red-900 dark:text-red-200 h-screen w-screen overflow-auto">
        <h1 className="text-xl font-bold">Something went wrong</h1>
        <p className="mt-2 font-semibold">
          {isDev && error instanceof Error
            ? error.message
            : 'An unexpected error occurred. Please try again or return to the dashboard.'}
        </p>
        {isDev && (
          <pre className="mt-4 p-4 bg-black/10 dark:bg-white/5 rounded overflow-x-auto text-sm">
            {error instanceof Error ? error.stack : JSON.stringify(error)}
          </pre>
        )}
        <Link
          to="/overview"
          className="inline-block mt-6 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    </RootDocument>
  )
}

function NotFoundComponent() {
  return (
    <RootDocument>
      <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 p-4">
        <p className="text-5xl font-bold text-zinc-200 dark:text-zinc-700">404</p>
        <h1 className="mt-4 text-xl font-bold">Page not found</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">The page you are looking for does not exist or has been moved.</p>
        <Link to="/overview" className="mt-8 px-4 py-2 bg-teal-600 hover:bg-teal-500 text-white rounded-lg font-medium transition-colors">
          Return to Dashboard
        </Link>
      </div>
    </RootDocument>
  )
}

function RootComponent() {
  const openPanel = usePreferencesUiStore((s) => s.openPanel)
  return (
    <MotionConfig reducedMotion="never">
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <LoadingOverlay />
          <PageTransitionProvider>
            <Outlet />
          </PageTransitionProvider>
          <ConsentEffects />
          <ConsentBanner onManage={openPanel} />
          <ConsentPreferences />
          <Suspense fallback={null}>
            <TanStackDevtools />
          </Suspense>
        </QueryClientProvider>
      </ThemeProvider>
    </MotionConfig>
  )
}

import React, { Suspense } from 'react'

const TanStackDevtools =
  process.env.NODE_ENV === 'production'
    ? () => null
    : React.lazy(() =>
        Promise.all([
          import('@tanstack/react-router-devtools'),
          import('@tanstack/react-query-devtools'),
        ]).then(([router, query]) => {
          return {
            default: () => (
              <>
                <router.TanStackRouterDevtools position="bottom-left" />
                <query.ReactQueryDevtools />
              </>
            ),
          }
        }),
      )

/**
 * Root document shell rendered on the server.
 *
 * The inline `<script>` runs synchronously before CSS is applied,
 * preventing a flash of light content on dark-mode page load.
 */
function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply .dark before first paint */}
        <script dangerouslySetInnerHTML={{ __html: ANTI_FLASH_SCRIPT }} />
        <HeadContent />
      </head>
      <body className="h-full font-sans bg-zinc-50 dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100">
        {children}
        <Toaster />
        <Scripts />
      </body>
    </html>
  )
}
