import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Button } from '../../../components/ui/Button'
import { useConsentStore } from '../store'
import { usePreferencesUiStore } from '../store-ui'

interface ToggleRowProps {
  id: string
  label: string
  description: string
  checked: boolean
  disabled?: boolean
  onChange?: (next: boolean) => void
}

function ToggleRow({ id, label, description, checked, disabled, onChange }: ToggleRowProps) {
  return (
    <label htmlFor={id} className="flex items-start gap-3 py-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
        className="mt-1 size-4 rounded accent-teal-600"
      />
      <span>
        <span className="block text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
        <span className="block text-xs text-zinc-500 dark:text-zinc-400">{description}</span>
      </span>
    </label>
  )
}

/**
 * Granular consent preferences. Necessary is always on. Analytics and Marketing
 * (placeholder) are user-controllable. Local draft state is committed to the
 * store only on Save.
 */
export function ConsentPreferences() {
  const open = usePreferencesUiStore((s) => s.open)
  const closePanel = usePreferencesUiStore((s) => s.closePanel)
  const analytics = useConsentStore((s) => s.analytics)
  const marketing = useConsentStore((s) => s.marketing)
  const setCategory = useConsentStore((s) => s.setCategory)

  const [analyticsDraft, setAnalyticsDraft] = useState(analytics === 'granted')
  const [marketingDraft, setMarketingDraft] = useState(marketing === 'granted')

  // Re-seed drafts whenever the panel opens so it reflects saved state.
  useEffect(() => {
    if (!open) return
    setAnalyticsDraft(analytics === 'granted')
    setMarketingDraft(marketing === 'granted')
  }, [open, analytics, marketing])

  const save = () => {
    setCategory('analytics', analyticsDraft ? 'granted' : 'denied')
    setCategory('marketing', marketingDraft ? 'granted' : 'denied')
    closePanel()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={closePanel}
          style={{ willChange: 'opacity' }}
        >
          <motion.div
            data-testid="consent-preferences"
            role="dialog"
            aria-label="Cookie preferences"
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
            style={{ willChange: 'transform, opacity' }}
            className="w-[min(32rem,100%)] rounded-md border border-zinc-300 bg-zinc-50 p-5 shadow-xl dark:border-zinc-700 dark:bg-zinc-900"
          >
            <h2 className="font-heading text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Cookie preferences
            </h2>
            <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
              <ToggleRow
                id="consent-necessary"
                label="Necessary"
                description="Required for sign-in, security, and remembering your choices. Always on."
                checked
                disabled
              />
              <ToggleRow
                id="consent-analytics"
                label="Analytics"
                description="Google Analytics and Grafana RUM, to understand and improve the site."
                checked={analyticsDraft}
                onChange={setAnalyticsDraft}
              />
              <ToggleRow
                id="consent-marketing"
                label="Marketing"
                description="Not used yet. Reserved for future advertising and personalisation."
                checked={marketingDraft}
                onChange={setMarketingDraft}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={closePanel}>
                Cancel
              </Button>
              <Button variant="secondary" onClick={save}>
                Save preferences
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
