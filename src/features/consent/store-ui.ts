import { create } from 'zustand'

interface PreferencesUiState {
  open: boolean
  openPanel: () => void
  closePanel: () => void
}

/** Ephemeral (non-persisted) open/close state for the preferences panel. */
export const usePreferencesUiStore = create<PreferencesUiState>((set) => ({
  open: false,
  openPanel: () => set({ open: true }),
  closePanel: () => set({ open: false }),
}))
