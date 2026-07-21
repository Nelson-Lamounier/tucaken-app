# Account components for tucaken-app

These TSX files implement the **Billing** and **Settings** pages for
already-onboarded users. They are written to drop into
`tucaken-app/src/features/account/`.

Both pages render **without their own left nav** — the host `AppLayout`
supplies the global nav. Each page is laid out with a single-page
**anchored** layout: scrollable content on the left, sticky table-of-contents
on the right that highlights the section currently in view.

---

## Stack

Same conventions as the rest of the codebase:

- **`lucide-react`** for icons
- **Tailwind v4** with the existing teal/emerald + zinc palette
- React 18 (no third-party state libs introduced)

No new dependencies.

---

## Files & destinations

| Source path here | Destination in `tucaken-app` |
|---|---|
| `account/types.ts` | `src/features/account/types.ts` |
| `account/components/PageShell.tsx` | `src/features/account/components/PageShell.tsx` |
| `account/components/primitives.tsx` | `src/features/account/components/primitives.tsx` |
| `account/billing/plans.ts` | `src/features/account/billing/plans.ts` |
| `account/billing/BillingPage.tsx` | `src/features/account/billing/BillingPage.tsx` |
| `account/billing/PlanSection.tsx` | `src/features/account/billing/PlanSection.tsx` |
| `account/billing/PaymentSection.tsx` | `src/features/account/billing/PaymentSection.tsx` |
| `account/billing/UsageSection.tsx` | `src/features/account/billing/UsageSection.tsx` |
| `account/billing/InvoicesSection.tsx` | `src/features/account/billing/InvoicesSection.tsx` |
| `account/billing/DetailsSection.tsx` | `src/features/account/billing/DetailsSection.tsx` |
| `account/billing/CancelSection.tsx` | `src/features/account/billing/CancelSection.tsx` |
| `account/settings/SettingsPage.tsx` | `src/features/account/settings/SettingsPage.tsx` |
| `account/settings/AppearanceSection.tsx` | `src/features/account/settings/AppearanceSection.tsx` |
| `account/settings/LocaleSection.tsx` | `src/features/account/settings/LocaleSection.tsx` |
| `account/settings/ResumeDefaultsSection.tsx` | `src/features/account/settings/ResumeDefaultsSection.tsx` |
| `account/settings/WorkspaceSection.tsx` | `src/features/account/settings/WorkspaceSection.tsx` |
| `account/settings/TokensSection.tsx` | `src/features/account/settings/TokensSection.tsx` |
| `account/settings/DataSection.tsx` | `src/features/account/settings/DataSection.tsx` |

---

## Wiring

Both top-level pages are **controlled** components: parent owns the data
and persistence, page calls `onUpdateBilling` / `onUpdateSettings` on every
change. This makes them easy to wire to TanStack server fns.

```tsx
// src/app/billing.tsx
import { BillingPage } from '@/features/account/billing/BillingPage'

export default function BillingRoute() {
  const { data: billing } = useBillingQuery()
  const updateBilling = useUpdateBillingMutation()

  return (
    <BillingPage
      billing={billing}
      onUpdateBilling={(patch) => updateBilling.mutate(patch)}
    />
  )
}
```

```tsx
// src/app/settings.tsx
import { SettingsPage } from '@/features/account/settings/SettingsPage'

export default function SettingsRoute() {
  const { data: settings } = useSettingsQuery()
  const updateSettings = useUpdateSettingsMutation()

  return (
    <SettingsPage
      settings={settings}
      onUpdateSettings={(patch) => updateSettings.mutate(patch)}
    />
  )
}
```

If you want optimistic local merging while a mutation is in flight, wrap
the parent with React state and reconcile on settle — the components don't
care, they just diff and re-render.

---

## Notes

- **Plan catalog** (`billing/plans.ts`) is static. Move it server-side when
  prices/features need to vary by region or experiment.
- **Cancel flow** is a two-step confirm with `cancelAtPeriodEnd` semantics.
  Once scheduled, the section flips to a "Reactivate" affordance.
- **API tokens** treats `revealed` as page-local state only. The full secret
  should only ever come back from the server on initial creation.
- **Webhooks** are stubbed for now — `Add webhook` button is non-functional;
  add a modal when you wire it.
- **Dark mode**: components are dark-themed by default but use semantic
  tokens (`zinc`, `teal`) so the existing `useTheme()` light tokens work
  without changes.
