# Component Catalogue — Tucaken UI Library

Full reference for every shared component in `src/components/ui/` and `src/components/layouts/`. Check here before creating any new component.

---

## Layout Components (`src/components/layouts/`)

### DashboardPage

**File:** `src/components/layouts/DashboardPage.tsx`

**Purpose:** Page-level wrapper for every authenticated route. Renders the title, optional description, optional right-aligned actions row, an optional full-width header-bottom slot (for tab bars), and the page body.

**When to use:** Always. Every `_dashboard.*` route component must wrap its output in `DashboardPage`. Never inline a heading.

**When NOT to use:** Routes that opt into full-bleed layout via `staticData: { disableMainWrapper: true }` may manage their own outer container, but still use `DashboardPage` for the heading where possible.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | `ReactNode` | Yes | Page heading (h2). |
| `description` | `ReactNode` | No | Subtitle shown below the title. |
| `actions` | `ReactNode` | No | Rendered right-aligned in the header row. Usually `Button` or `HeaderLink`. |
| `headerBottom` | `ReactNode` | No | Full-width row rendered below the title/actions row. Use for tab bars. |
| `fullWidth` | `boolean` | No | Reserved. Defaults to `false`. |
| `children` | `ReactNode` | Yes | Page body. |

**Usage examples:**

```tsx
import { DashboardPage } from '@/components/layouts/DashboardPage'

// Minimal
<DashboardPage title="Reports">
  <p>Content here.</p>
</DashboardPage>

// With description and action
<DashboardPage
  title="GitHub"
  description="Connect your GitHub account to index repositories."
  actions={<Button variant="primary">Connect GitHub</Button>}
>
  {children}
</DashboardPage>

// With tab bar pinned to header
<DashboardPage
  title="Applications"
  headerBottom={<TabUnderline tabs={tabs} onChange={setActiveTab} />}
>
  {children}
</DashboardPage>
```

---

### AppLayout

**File:** `src/components/layouts/AppLayout.tsx`

**Purpose:** Root shell: sidebar navigation, header nav bar, main content area. Manages primary `navigation[]` and `settingsNavigation[]` arrays.

**When to use:** Never render directly — it wraps the `_dashboard` layout route automatically. Edit it only to add nav entries for new routes.

**How to add a nav entry:**

```tsx
// Primary nav
const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'New Page', href: '/new-page', icon: SomeHeroIcon },
]

// Settings nav
const settingsNavigation = [
  { name: 'GitHub', href: '/settings/github', icon: GithubIcon }, // lucide-react
]
```

Primary nav icons: `@heroicons/react/24/outline`. Settings nav icons: `lucide-react`.

---

## UI Components (`src/components/ui/`)

### Button

**File:** `src/components/ui/Button.tsx`

**Purpose:** All interactive button actions in the app. Includes focus-visible rings, disabled opacity, cursor-not-allowed, and transition-colors out of the box.

**When to use:** Every clickable action that is not a navigation link. Never use a raw `<button>` element.

**When NOT to use:** Navigation links — use `HeaderLink` (internal/external) or TanStack Router `<Link>` instead.

**Props (`Button`):**

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `ButtonVariant` | `'primary'` | Visual style. See variants below. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Retained for API compatibility; sizing is primarily driven by variant. |
| `fullWidth` | `boolean` | `false` | Stretches to 100% width. |
| `disabled` | `boolean` | — | Native disabled, adds opacity-50 + cursor-not-allowed. |
| `onClick` | `() => void` | — | Click handler. |
| `children` | `ReactNode` | — | Button label. |
| `className` | `string` | — | Appended to base classes. |

**Variants:**

| Variant | Appearance | Use for |
|---|---|---|
| `primary` | Blue outline on blue-tinted background | Additive / informational actions |
| `secondary` | Solid teal background, white text | Primary confirm / save actions |
| `danger` | Red outline on red-tinted background | Small destructive actions |
| `danger-lg` | Red outline, larger padding | Modal footer destructive actions |
| `warning` | Amber outline on amber-tinted background | Reversible / cautionary actions |
| `ghost` | Zinc/neutral outline | Cancel, neutral secondary actions |

**Sub-components:**

| Export | Purpose | Props |
|---|---|---|
| `AddButton` | Dashed ghost button for adding list items | `onClick`, `children` |
| `RemoveButton` | Trash icon button for removing list items | `onClick`, `title?` |
| `AddSubItemButton` | Inline text link for adding sub-items | `onClick`, `children` |
| `RemoveSubItemButton` | Inline trash icon for removing sub-items | `onClick`, `title?` |
| `HeaderLink` | Styled link for header action slot | `to?`, `href?`, `target?`, `rel?`, `children` |

**Usage:**

```tsx
import { Button, AddButton, RemoveButton, HeaderLink } from '@/components/ui/Button'

<Button variant="secondary" onClick={handleSave} disabled={isPending}>Save</Button>
<Button variant="danger" onClick={handleDelete} disabled={isPending}>Delete</Button>
<Button variant="primary" onClick={handleConnect}>Connect</Button>
<Button variant="ghost" onClick={handleCancel}>Cancel</Button>
<Button variant="warning" onClick={handleRevoke}>Revoke Access</Button>
<Button variant="danger-lg" onClick={handleDelete}>Delete Account</Button>

<AddButton onClick={handleAdd}>Add repository</AddButton>
<RemoveButton onClick={() => removeItem(id)} title="Remove repository" />

<HeaderLink to="/settings">Settings</HeaderLink>
<HeaderLink href="https://github.com" target="_blank" rel="noopener noreferrer">GitHub</HeaderLink>
```

---

### LinkCard

**File:** `src/components/ui/LinkCards.tsx`

**Purpose:** Dark card tile for displaying a named item with a title, subtitle, optional leading icon, optional top-right slot (badges, status), and optional bottom slot (actions).

**When to use:** Any list of items where each row needs title + subtitle + optional affordances. Common for connected repos, application cards, pipeline cards.

**When NOT to use:** Hub navigation tiles with large icons — use `GridListActions` instead.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | `ReactNode` | Yes | Primary label. |
| `subtitle` | `ReactNode` | Yes | Secondary descriptor (truncated). |
| `icon` | `ReactNode` | No | Leading icon, rendered in a circular zinc container. |
| `onClick` | `() => void` | No | Makes the title/subtitle area a button. |
| `topRight` | `ReactNode` | No | Right-aligned slot in the header row (badges, status chips). |
| `bottom` | `ReactNode` | No | Slot below a divider at the card bottom (action buttons). |

**Usage:**

```tsx
import { LinkCard } from '@/components/ui/LinkCards'

// Basic
<LinkCard title="my-org/my-repo" subtitle="Last synced 3 minutes ago" />

// With status badge and remove action
<LinkCard
  title={repo.name}
  subtitle={repo.fullName}
  topRight={<SyncStatusBadge status={repo.syncStatus} />}
  bottom={
    <Button variant="danger" onClick={() => removeRepo(repo.id)}>
      Remove
    </Button>
  }
/>

// With leading icon and clickable title
<LinkCard
  icon={<GitHubIcon className="size-5 text-zinc-400" />}
  title="Repository Name"
  subtitle="owner/repo"
  onClick={() => navigate({ to: `/repos/${repo.id}` })}
/>
```

---

### GridListActions

**File:** `src/components/ui/GridListActions.tsx`

**Purpose:** Responsive 2-column grid of large action tiles with an icon badge, title, description, and an arrow indicator. Used for hub pages.

**When to use:** Top-level hub pages where the user picks a primary action or navigates to a sub-section (e.g. Applications Hub, Pipelines Hub).

**When NOT to use:** Lists of data items — use `LinkCard` instead.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `actions` | `GridListAction[]` | Yes | Array of tile definitions. |

**`GridListAction` shape:**

| Field | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | Yes | Tile heading. |
| `href` | `string` | No | TanStack Router internal link. Mutually exclusive with `onClick`. |
| `onClick` | `() => void` | No | Click handler. Mutually exclusive with `href`. |
| `icon` | `React.ElementType` | Yes | Icon component (renders at `size-6`). |
| `iconForeground` | `string` | Yes | Tailwind text color class for the icon. |
| `iconBackground` | `string` | Yes | Tailwind background class for the icon container. |
| `description` | `string` | No | Subtitle shown below the title. |

**Usage:**

```tsx
import { GridListActions, type GridListAction } from '@/components/ui/GridListActions'
import { PlusCircleIcon, Cog6ToothIcon } from '@heroicons/react/24/outline'

const actions: GridListAction[] = [
  {
    title: 'New Application',
    href: '/applications/new',
    icon: PlusCircleIcon,
    iconForeground: 'text-teal-400',
    iconBackground: 'bg-teal-500/10',
    description: 'Register a new application for indexing.',
  },
  {
    title: 'Configure Pipelines',
    onClick: openDrawer,
    icon: Cog6ToothIcon,
    iconForeground: 'text-indigo-400',
    iconBackground: 'bg-indigo-500/10',
    description: 'Manage ingestion pipelines.',
  },
]

<GridListActions actions={actions} />
```

---

### DashboardDrawer

**File:** `src/components/ui/DashboardDrawer.tsx`

**Purpose:** Slide-over panel that overlays the content area without replacing the page. Built on Headless UI `Dialog`. Clears the 64px header nav and, on large screens, respects the 18rem sidebar width.

**When to use:** Detail views, multi-step forms, pickers (repo picker, pipeline picker) that need context from the underlying page.

**When NOT to use:** Confirmations — use a small inline alert or a confirm dialog instead.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `isOpen` | `boolean` | Yes | Controls visibility. |
| `onClose` | `() => void` | Yes | Called when the user closes the panel. |
| `title` | `ReactNode` | Yes | Panel heading. |
| `description` | `ReactNode` | No | Subtitle below the heading. |
| `actions` | `ReactNode` | No | Rendered left of the close button in the header. |
| `unstyledContent` | `boolean` | No | Skip inner scroll wrapper. Use when content manages its own scroll. |
| `children` | `ReactNode` | Yes | Panel body. |

**Usage:**

```tsx
import { DashboardDrawer } from '@/components/ui/DashboardDrawer'

const [open, setOpen] = useState(false)

<Button variant="primary" onClick={() => setOpen(true)}>Open</Button>

<DashboardDrawer
  isOpen={open}
  onClose={() => setOpen(false)}
  title="Add Repository"
  description="Select a repository to connect to your knowledge base."
  actions={<Button variant="secondary" onClick={handleSave}>Save</Button>}
>
  <RepoPicker onSelect={handleSelect} />
</DashboardDrawer>
```

---

### Field (FormInput, FormTextarea, FieldInfo)

**File:** `src/components/ui/Field.tsx`

**Purpose:** TanStack Form-aware input and textarea components. Wires `id`, `name`, `value`, `onBlur`, `onChange`, and validation error display automatically.

**When to use:** Every form field inside a TanStack Form `<form.Field>` renderer.

**When NOT to use:** Controlled inputs outside TanStack Form — use a raw `<input>` with Tailwind in that case.

**Exports:**

| Export | Element | Description |
|---|---|---|
| `FormInput` | `<input>` | Single-line text input with label. |
| `FormTextarea` | `<textarea>` | Multi-line textarea with label. |
| `FieldInfo` | — | Renders validation error / validating state below a field. |

**`FormInput` props:** `label` (string), `field` (TanStack Form field API), plus all native `<input>` attributes.

**`FormTextarea` props:** `label` (string), `field` (TanStack Form field API), plus all native `<textarea>` attributes.

**Usage:**

```tsx
import { FormInput, FormTextarea } from '@/components/ui/Field'

<form.Field name="slug">
  {(field) => (
    <FormInput
      label="Application Slug"
      field={field}
      placeholder="my-app"
      autoComplete="off"
    />
  )}
</form.Field>

<form.Field name="description">
  {(field) => (
    <FormTextarea label="Description" field={field} rows={4} />
  )}
</form.Field>
```

---

### SectionHeader

**File:** `src/components/ui/SectionHeader.tsx`

**Purpose:** Sub-section heading with optional description, optional right-aligned action slot, and optional expand/collapse behavior.

**When to use:** Dividing a page or drawer into named sections, especially when a section is collapsible.

**Props:**

| Prop | Type | Required | Description |
|---|---|---|---|
| `title` | `string` | Yes | Section heading text. |
| `description` | `ReactNode` | No | Secondary text below the title. |
| `action` | `ReactNode` | No | Right-aligned slot (buttons, badges). |
| `onClick` | `() => void` | No | Makes the header clickable. |
| `isExpanded` | `boolean` | No | Controls the chevron direction when `expandable`. |
| `expandable` | `boolean` | No | Shows a chevron indicator. |

**Usage:**

```tsx
import { SectionHeader } from '@/components/ui/SectionHeader'

// Static
<SectionHeader title="Connected Repositories" description="Repositories indexed into the knowledge base." />

// With action
<SectionHeader
  title="Connected Repositories"
  action={<Button variant="primary" onClick={openPicker}>Add</Button>}
/>

// Collapsible
const [expanded, setExpanded] = useState(true)
<SectionHeader
  title="Advanced Settings"
  expandable
  isExpanded={expanded}
  onClick={() => setExpanded((v) => !v)}
/>
{expanded && <AdvancedSettings />}
```

---

### Tabs, TabUnderline, TabbedContainer

**File:** `src/components/ui/Tabs.tsx`, `src/components/ui/TabUnderline.tsx`, `src/components/ui/TabbedContainer.tsx`

**Purpose:** Tab navigation. Three variants for different contexts.

**When to use:**

- `Tabs` — standalone tab bar with a bottom border, mobile select fallback, optional count badges.
- `TabUnderline` — underline-style tabs for use in the `DashboardPage` `headerBottom` slot.
- `TabbedContainer` — self-contained tabbed section with built-in content rendering.

**`TabItem` shape** (from `src/types`):

```typescript
interface TabItem {
  name: string
  current: boolean
  count?: number
}
```

**`Tabs` usage:**

```tsx
import { Tabs } from '@/components/ui/Tabs'

const [tabs, setTabs] = useState([
  { name: 'Active', current: true },
  { name: 'Archived', current: false, count: 3 },
])

<Tabs
  tabs={tabs}
  onTabChange={(name) =>
    setTabs((prev) => prev.map((t) => ({ ...t, current: t.name === name })))
  }
/>
```

**`TabUnderline` usage (for `DashboardPage.headerBottom`):**

```tsx
import { TabUnderline } from '@/components/ui/TabUnderline'

<DashboardPage
  title="Applications"
  headerBottom={
    <TabUnderline
      tabs={tabs}
      onChange={(name) => setActiveTab(name)}
    />
  }
>
  {/* tab content */}
</DashboardPage>
```

---

### Stats and StatsCard

**File:** `src/components/ui/Stats.tsx`, `src/components/ui/StatsCard.tsx`

**Purpose:** Metric display tiles. `Stats` renders a grid of stat items; `StatsCard` renders an individual card.

**When to use:** Dashboard summary sections, pipeline metrics, usage overviews.

**Usage:**

```tsx
import { Stats } from '@/components/ui/Stats'

<Stats
  items={[
    { label: 'Total Repos', value: 12 },
    { label: 'Indexed', value: 9 },
    { label: 'Pending', value: 3 },
  ]}
/>
```

---

### Pagination and CardPagination

**File:** `src/components/ui/Pagination.tsx`, `src/components/ui/CardPagination.tsx`

**Purpose:** Pagination controls for list views.

**When to use:** Any list that exceeds a single page. `Pagination` for table-style lists; `CardPagination` for card-grid lists.

**Usage:**

```tsx
import { Pagination } from '@/components/ui/Pagination'

<Pagination
  currentPage={page}
  totalPages={totalPages}
  onPageChange={(p) => setPage(p)}
/>
```

---

### Toaster and useToastStore

**File:** `src/components/ui/Toaster.tsx`

**Purpose:** Toast notification display. `Toaster` must be mounted once (it is in the root layout). Trigger toasts via `useToastStore`.

**When to use:** Mutation success/error feedback, async operation results.

**Usage:**

```tsx
import { useToastStore } from '@/lib/stores/toast-store'

const { addToast } = useToastStore()

// In a mutation handler
onError: (err: Error) => {
  addToast('error', `Failed to remove repository: ${err.message}`)
},
onSuccess: () => {
  addToast('success', 'Repository removed.')
},
```

---

### ProgressBar

**File:** `src/components/ui/ProgressBar.tsx`

**Purpose:** Horizontal progress indicator.

**When to use:** File uploads, multi-step forms, pipeline ingestion progress.

---

### FullWidthBar

**File:** `src/components/ui/FullWidthBar.tsx`

**Purpose:** Full-width horizontal divider or bar element.

**When to use:** Visual section breaks within a page or drawer.

---

### CommandPallete

**File:** `src/components/ui/CommandPallete.tsx`

**Purpose:** Global command palette (keyboard shortcut search). Already mounted in the root layout.

**When to use:** Never render directly. Register new commands by extending the command source.

---

### NotificationPanel

**File:** `src/components/ui/NotificationPanel.tsx`

**Purpose:** Notification list panel, rendered from the header nav.

**When to use:** Never render directly. Works through the notification store.

---

### PipelineNotificationWatcher

**File:** `src/components/ui/PipelineNotificationWatcher.tsx`

**Purpose:** Background component (renders null) that polls for pipeline events and triggers toasts.

**When to use:** Already mounted in the app shell. Do not mount again.

---

### HeaderNav

**File:** `src/components/ui/HeaderNav.tsx`

**Purpose:** Top navigation bar with logo, search trigger, notification bell, and user menu.

**When to use:** Never render directly. It is part of `AppLayout`.

---

### MultiColumnLayout

**File:** `src/components/ui/MultiColumnLayout.tsx`

**Purpose:** Multi-column page layout for content that needs a sidebar or secondary panel alongside the main area.

**When to use:** Pages with a detail-and-list two-pane layout.

---

### Dropdown Components

**Files:** `src/components/ui/DropDown.tsx`, `src/components/ui/DropDownArticles.tsx`, `src/components/ui/DropDownOptions.tsx`, `src/components/ui/CustomDropDown.tsx`

**Purpose:** Various dropdown menu variants for different content types and contexts.

**When to use:**
- `CustomDropDown` — generic dropdown with custom trigger and items.
- `DropDown` — standard option list dropdown.
- `DropDownArticles` — dropdown with article/link items.
- `DropDownOptions` — dropdown with selectable option items.

---

## Motion for React

**Source:** `.claude/rules/motion-react.md`

### Import rules

```tsx
// Client component ('use client' directive or bundled client-side):
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring, animate } from 'motion/react'

// Server component ONLY:
import * as motion from 'motion/react-client'

// NEVER — crashes at runtime:
import { motion } from 'framer-motion'
```

### willChange

Add to any element that animates transform or opacity:

```tsx
// Only these values are valid in willChange:
// 'transform', 'opacity', 'clipPath', 'filter'

<motion.div
  animate={{ x: 100 }}
  style={{ willChange: 'transform' }}
/>

<motion.div
  animate={{ opacity: 1, x: 100 }}
  style={{ willChange: 'transform, opacity' }}
/>
```

Prefer `style={{ willChange: '...' }}` co-located with other styles, or a stylesheet class.

### Radix integration

```tsx
// Add animation to a Radix primitive using asChild
<RadixComponent asChild>
  <motion.div animate={{ opacity: 1 }}>...</motion.div>
</RadixComponent>

// Exit animations: hoist open state, use AnimatePresence, apply forceMount
const [open, setOpen] = useState(false)

<AnimatePresence>
  {open && (
    <RadixContent forceMount>
      <motion.div exit={{ opacity: 0 }}>...</motion.div>
    </RadixContent>
  )}
</AnimatePresence>
```

---

## Compose vs. Create Decision Tree

```
Need a clickable action?
  └─ Yes → Button (choose variant)

Need a page heading?
  └─ Yes → DashboardPage

Need a card for a data item (repo, app, pipeline)?
  └─ Yes → LinkCard

Need a hub with large nav tiles?
  └─ Yes → GridListActions

Need a slide-over panel?
  └─ Yes → DashboardDrawer

Need a form field?
  └─ Yes → FormInput / FormTextarea (Field.tsx)

Need a sub-section heading?
  └─ Yes → SectionHeader

Need tabs?
  └─ Yes → Tabs / TabUnderline / TabbedContainer

Need metric display?
  └─ Yes → Stats / StatsCard

Need pagination?
  └─ Yes → Pagination / CardPagination

Need a toast?
  └─ Yes → useToastStore (never render Toaster manually)

Need an animation?
  └─ Yes → motion/react (never framer-motion)

None of the above match?
  └─ Create a new component in src/features/<domain>/components/
     and document it here.
```
