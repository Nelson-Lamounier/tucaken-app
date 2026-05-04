// src/features/account/settings/ResumeDefaultsSection.tsx
//
// Default template (with mini-previews), tone, page size, and per-resume
// toggles (photo, link block, auto-publish to web).

import { Check } from 'lucide-react'
import type {
  PageSize,
  ResumeDefaults,
  ResumeTemplate,
  ResumeTone,
} from '../types'
import { Card, Field, Row, Segmented, Toggle } from '../components/primitives'

interface Props {
  defaults: ResumeDefaults
  onChange: (patch: Partial<ResumeDefaults>) => void
}

const TEMPLATES: { v: ResumeTemplate; l: string }[] = [
  { v: 'classic', l: 'Classic' },
  { v: 'compact', l: 'Compact' },
  { v: 'modern',  l: 'Modern'  },
]

const TONES: { v: ResumeTone; l: string }[] = [
  { v: 'professional', l: 'Professional' },
  { v: 'warm',         l: 'Warm' },
  { v: 'punchy',       l: 'Punchy' },
]

const PAGE_SIZES: PageSize[] = ['Letter', 'A4']

export function ResumeDefaultsSection({ defaults, onChange }: Props) {
  return (
    <Card>
      <div className="space-y-6">
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
            Default template
          </div>
          <div className="grid grid-cols-3 gap-2">
            {TEMPLATES.map((t) => {
              const active = defaults.template === t.v
              return (
                <button
                  key={t.v}
                  type="button"
                  onClick={() => onChange({ template: t.v })}
                  className={[
                    'rounded-lg border p-4 text-left transition',
                    active
                      ? 'border-teal-400/40 bg-teal-500/[0.04]'
                      : 'border-white/10 bg-white/[0.02] hover:border-white/20',
                  ].join(' ')}
                >
                  <ResumePreview kind={t.v} active={active} />
                  <div className="mt-3 flex items-center justify-between">
                    <span className={['text-xs font-medium', active ? 'text-zinc-100' : 'text-zinc-300'].join(' ')}>
                      {t.l}
                    </span>
                    {active && <Check className="size-3.5 text-teal-300" strokeWidth={2.5} />}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Field label="Tone">
            <Segmented
              className="w-full"
              value={defaults.tone}
              onChange={(v) => onChange({ tone: v })}
              options={TONES.map((t) => ({ value: t.v, label: t.l }))}
            />
          </Field>
          <Field label="Page size">
            <Segmented
              className="w-full"
              value={defaults.pageSize}
              onChange={(v) => onChange({ pageSize: v })}
              options={PAGE_SIZES.map((s) => ({ value: s, label: s }))}
            />
          </Field>
        </div>

        <div className="space-y-3 border-t border-white/5 pt-4">
          <Row
            title="Include profile photo"
            sub="Adds your avatar to the header of new resumes."
            action={
              <Toggle
                checked={defaults.includePhoto}
                onChange={(v) => onChange({ includePhoto: v })}
                label="Photo"
              />
            }
          />
          <Row
            title="Include link block"
            sub="GitHub, LinkedIn, portfolio shown as a small row under your name."
            action={
              <Toggle
                checked={defaults.includeLinks}
                onChange={(v) => onChange({ includeLinks: v })}
                label="Links"
              />
            }
          />
          <Row
            title="Auto-publish to web"
            sub="When you generate a resume, immediately make a public web URL."
            action={
              <Toggle
                checked={defaults.autoPublish}
                onChange={(v) => onChange({ autoPublish: v })}
                label="Auto-publish"
              />
            }
          />
        </div>
      </div>
    </Card>
  )
}

function ResumePreview({
  kind,
  active,
}: {
  kind: ResumeTemplate
  active: boolean
}) {
  return (
    <div className={['relative aspect-[8.5/11] w-full overflow-hidden rounded bg-zinc-900 ring-1', active ? 'ring-teal-400/40' : 'ring-white/10'].join(' ')}>
      <div className="p-2">
        {kind === 'modern' && <div className="h-2 w-full rounded-sm bg-teal-500/40" />}
        <div className={['mt-1.5 h-1 rounded bg-zinc-300', kind === 'compact' ? 'w-1/2' : 'w-2/3'].join(' ')} />
        <div className="mt-1 h-0.5 w-1/3 rounded bg-zinc-600" />
        <div className="mt-2 space-y-0.5">
          <div className="h-0.5 w-full rounded bg-zinc-700" />
          <div className="h-0.5 w-5/6 rounded bg-zinc-700" />
          <div className="h-0.5 w-4/6 rounded bg-zinc-700" />
        </div>
        <div className="mt-2 h-0.5 w-1/4 rounded bg-zinc-500" />
        <div className="mt-1 space-y-0.5">
          <div className="h-0.5 w-full rounded bg-zinc-700" />
          <div className="h-0.5 w-3/4 rounded bg-zinc-700" />
        </div>
        {kind !== 'compact' && (
          <>
            <div className="mt-2 h-0.5 w-1/4 rounded bg-zinc-500" />
            <div className="mt-1 space-y-0.5">
              <div className="h-0.5 w-full rounded bg-zinc-700" />
              <div className="h-0.5 w-2/3 rounded bg-zinc-700" />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
