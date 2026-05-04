// src/features/account/settings/AppearanceSection.tsx
//
// Theme/accent/density/reduced-motion controls. Theme picker has small
// on-canvas previews so users see the choice before clicking.

import { Layout, Moon, Sun, Zap } from 'lucide-react'
import type { Accent, AppearanceSettings, Theme } from '../types'
import { Card, Row, Segmented, Toggle } from '../components/primitives'

interface Props {
  appearance: AppearanceSettings
  onChange: (patch: Partial<AppearanceSettings>) => void
}

const THEMES: { v: Theme; l: string; Icon: typeof Sun }[] = [
  { v: 'light',  l: 'Light',  Icon: Sun    },
  { v: 'dark',   l: 'Dark',   Icon: Moon   },
  { v: 'system', l: 'System', Icon: Layout },
]

const ACCENTS: { v: Accent; color: string }[] = [
  { v: 'teal',   color: '#2dd4bf' },
  { v: 'indigo', color: '#818cf8' },
  { v: 'rose',   color: '#fb7185' },
  { v: 'amber',  color: '#fbbf24' },
]

export function AppearanceSection({ appearance, onChange }: Props) {
  return (
    <Card>
      <div className="space-y-6">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Theme
          </div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ v, l, Icon }) => {
              const active = appearance.theme === v
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => onChange({ theme: v })}
                  className={[
                    'flex flex-col items-center gap-2 rounded-lg border p-4 transition',
                    active
                      ? 'border-teal-400/40 bg-teal-500/[0.04]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                  ].join(' ')}
                >
                  <ThemePreview kind={v} active={active} />
                  <div className="flex items-center gap-1.5">
                    <Icon className={['size-3.5', active ? 'text-teal-300' : 'text-zinc-500'].join(' ')} />
                    <span className={['text-xs font-medium', active ? 'text-zinc-100' : 'text-zinc-400'].join(' ')}>{l}</span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Accent</div>
          <div className="flex items-center gap-2">
            {ACCENTS.map(({ v, color }) => (
              <button
                key={v}
                type="button"
                onClick={() => onChange({ accent: v })}
                aria-label={v}
                className={[
                  'size-8 rounded-full transition ring-2 ring-offset-2 ring-offset-zinc-950',
                  appearance.accent === v ? 'ring-white/30 scale-110' : 'ring-transparent hover:scale-105',
                ].join(' ')}
                style={{ background: color }}
              />
            ))}
            <span className="ml-2 text-[11px] text-zinc-500 capitalize">{appearance.accent}</span>
          </div>
        </div>

        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">Density</div>
          <Segmented
            value={appearance.density}
            onChange={(v) => onChange({ density: v })}
            options={[
              { value: 'comfortable', label: 'Comfortable' },
              { value: 'compact',     label: 'Compact' },
            ]}
          />
        </div>

        <Row
          icon={<Zap className="size-4 text-zinc-300" />}
          title="Reduce motion"
          sub="Minimizes animations and transitions across the product."
          action={
            <Toggle
              checked={appearance.reducedMotion}
              onChange={(v) => onChange({ reducedMotion: v })}
              label="Reduce motion"
            />
          }
        />
      </div>
    </Card>
  )
}

function ThemePreview({ kind, active }: { kind: Theme; active: boolean }) {
  const isLight = kind === 'light'
  const isSystem = kind === 'system'
  return (
    <div className={['relative h-14 w-full overflow-hidden rounded-md ring-1', active ? 'ring-teal-400/40' : 'ring-white/10'].join(' ')}>
      {isSystem ? (
        <>
          <div className="absolute inset-0 grid grid-cols-2">
            <div className="bg-white" />
            <div className="bg-zinc-900" />
          </div>
          <div className="absolute left-2 top-2 h-1 w-6 rounded bg-zinc-300" />
          <div className="absolute right-2 top-2 h-1 w-6 rounded bg-zinc-700" />
        </>
      ) : (
        <>
          <div className={['absolute inset-0', isLight ? 'bg-white' : 'bg-zinc-900'].join(' ')} />
          <div className={['absolute left-2 top-2 h-1 w-8 rounded', isLight ? 'bg-zinc-300' : 'bg-zinc-700'].join(' ')} />
          <div className={['absolute left-2 top-4 h-1 w-12 rounded', isLight ? 'bg-zinc-200' : 'bg-zinc-800'].join(' ')} />
          <div className={['absolute bottom-2 left-2 h-2 w-2 rounded-full', isLight ? 'bg-teal-500' : 'bg-teal-400'].join(' ')} />
        </>
      )}
    </div>
  )
}
