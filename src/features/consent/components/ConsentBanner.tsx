import { AnimatePresence, motion } from 'motion/react'
import { Button } from '../../../components/ui/Button'
import { useConsentStore } from '../store'

interface ConsentBannerProps {
  /** Open the granular preferences panel. */
  onManage: () => void
}

/**
 * Cookie consent banner. Shows once, until the user makes a decision.
 * "Accept all" and "Reject all" carry equal weight (PECR/GDPR requirement).
 */
export function ConsentBanner({ onManage }: ConsentBannerProps) {
  const decided = useConsentStore((s) => s.decided)
  const acceptAll = useConsentStore((s) => s.acceptAll)
  const rejectAll = useConsentStore((s) => s.rejectAll)

  return (
    <AnimatePresence>
      {!decided && (
        <motion.div
          data-testid="consent-banner"
          role="dialog"
          aria-label="Cookie consent"
          aria-live="polite"
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          style={{ willChange: 'transform, opacity' }}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto mb-4 w-[min(48rem,calc(100%-2rem))] rounded-md border border-zinc-300 bg-zinc-50 p-4 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
        >
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            Tucaken uses cookies to understand how the site is used and to improve
            it. Analytics cookies are only set with your consent. See our{' '}
            <a
              href="/privacy"
              className="font-medium text-teal-600 underline hover:text-teal-500 dark:text-teal-400"
            >
              privacy policy
            </a>
            .
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={acceptAll}>
              Accept all
            </Button>
            <Button variant="ghost" onClick={rejectAll}>
              Reject all
            </Button>
            <button
              type="button"
              onClick={onManage}
              className="ml-auto text-xs font-medium text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Manage preferences
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
