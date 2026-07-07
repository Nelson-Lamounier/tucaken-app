import { useState } from 'react'
import { Check, ClipboardList, Copy } from 'lucide-react'
import {
  RESUME_ANGLE_LABELS,
  type ProjectResumeBullets,
  type ResumeAngle,
} from '../../lib/types'
import { EmptyHint, Section } from './Section'

export function ResumeBullets({ angles }: { readonly angles: ProjectResumeBullets[] }) {
  const [selected, setSelected] = useState<ResumeAngle | null>(angles[0]?.angle ?? null)
  const [copied, setCopied] = useState(false)
  const active = angles.find((a) => a.angle === selected) ?? angles[0] ?? null

  const copyBullets = async () => {
    if (!active) return
    try {
      await navigator.clipboard.writeText(active.bullets.join('\n'))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard denied — the bullets stay selectable for manual copy.
    }
  }

  return (
    <Section
      icon={ClipboardList}
      title="Resume bullets"
      subtitle="One angle per role you might target"
    >
      {angles.length === 0 || active === null ? (
        <EmptyHint>Resume bullets haven't been generated yet.</EmptyHint>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {angles.map((a) => {
              const isActive = a.angle === active.angle
              return (
                <button
                  key={a.angle}
                  type="button"
                  onClick={() => setSelected(a.angle)}
                  aria-pressed={isActive}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                    isActive
                      ? 'bg-teal-400/15 text-teal-200 inset-ring inset-ring-teal-400/40'
                      : 'bg-white/5 text-zinc-400 inset-ring inset-ring-white/10 hover:text-zinc-200'
                  }`}
                >
                  {RESUME_ANGLE_LABELS[a.angle] ?? a.angle}
                </button>
              )
            })}
            <button
              type="button"
              onClick={copyBullets}
              aria-label="Copy bullets"
              className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs text-zinc-400 inset-ring inset-ring-white/10 transition-colors hover:text-zinc-200"
            >
              {copied ? <Check className="size-3.5 text-teal-400" /> : <Copy className="size-3.5" />}
              {copied ? 'Copied' : 'Copy bullets'}
            </button>
          </div>
          <ul className="space-y-2 text-sm text-zinc-300">
            {active.bullets.map((b, i) => (
              <li key={i} className="flex gap-2">
                <span className="mt-2 size-1 shrink-0 rounded-full bg-teal-400" aria-hidden />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  )
}
