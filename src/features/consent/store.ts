import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  CONSENT_VERSION,
  type ConsentActions,
  type ConsentState,
} from './types'

const STORAGE_KEY = 'tucaken-consent'

const INITIAL_STATE: ConsentState = {
  analytics: undefined,
  marketing: undefined,
  decided: false,
  version: CONSENT_VERSION,
}

export const useConsentStore = create<ConsentState & ConsentActions>()(
  persist(
    (set) => ({
      ...INITIAL_STATE,

      acceptAll: () =>
        set({ analytics: 'granted', marketing: 'granted', decided: true }),

      rejectAll: () =>
        set({ analytics: 'denied', marketing: 'denied', decided: true }),

      setCategory: (category, value) =>
        set({ [category]: value, decided: true }),

      reset: () => set({ ...INITIAL_STATE }),
    }),
    {
      name: STORAGE_KEY,
      version: CONSENT_VERSION,
      // Force re-consent if a persisted record predates the current version.
      migrate: (persisted, version) => {
        if (version !== CONSENT_VERSION) return { ...INITIAL_STATE }
        return persisted as ConsentState & ConsentActions
      },
      partialize: (state) => ({
        analytics: state.analytics,
        marketing: state.marketing,
        decided: state.decided,
        version: state.version,
      }),
    },
  ),
)
