import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react'
import { Hammer, GitMerge, Database, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'

export type ProjectIntentChoice =
  | { intent: 'build' }
  | { intent: 'link'; targetProjectId: string }
  | { intent: 'none' }

/** A single intent choice rendered as a rich, scannable card. */
function OptionCard({
  icon,
  title,
  description,
  onClick,
  recommended = false,
  disabled = false,
}: {
  readonly icon: ReactNode
  readonly title: string
  readonly description: string
  readonly onClick: () => void
  readonly recommended?: boolean
  readonly disabled?: boolean
}) {
  const tone = recommended
    ? 'border-accent/40 bg-accent/5 hover:bg-accent/10'
    : 'border-white/10 bg-white/5 hover:bg-white/10'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex items-start gap-3 rounded-md border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tone}`}
    >
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-white/5 text-accent">
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-100">{title}</p>
          {recommended && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent">
              Recommended
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-zinc-400">{description}</p>
      </div>
    </button>
  )
}

export function ProjectIntentModal({
  open,
  projects,
  onChoose,
  onClose,
}: {
  readonly open: boolean
  readonly projects: ReadonlyArray<{ id: string; name: string }>
  readonly onChoose: (choice: ProjectIntentChoice) => void
  readonly onClose: () => void
}) {
  const [mode, setMode] = useState<'pick' | 'link'>('pick')
  const [target, setTarget] = useState('')

  // Reset to the choice screen whenever the modal closes, so a half-navigated
  // link flow does not carry over to the next repo the user adds.
  useEffect(() => {
    if (!open) {
      setMode('pick')
      setTarget('')
    }
  }, [open])

  const hasProjects = projects.length > 0
  const linkDescription = hasProjects
    ? 'Add this repository to a Project you have already created and regenerate it with the new code. Ideal when several repositories belong to the same product — a monorepo, or a split front-end and back-end — so the Project, and the resumes built from it, reflect the whole system.'
    : 'You have no confirmed Projects to link to yet. Create one first, or build a new Project from this repository.'

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div aria-hidden="true" className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-xl border border-white/10 bg-zinc-900 p-8 shadow-2xl">
          <DialogTitle className="text-lg font-semibold text-zinc-100">
            What should this repository become?
          </DialogTitle>
          <p className="mt-1 text-sm text-zinc-400">
            Choose how Tucaken uses this repository once it finishes syncing. You can change this later.
          </p>

          {mode === 'pick' ? (
            <div className="mt-6 flex flex-col gap-3">
              <OptionCard
                icon={<Hammer className="size-4.5" aria-hidden />}
                title="Build a new Project"
                description="Generate a Project case study from this repository once it syncs. Tucaken indexes its full context — code, commit history and structure — so when you tailor a resume to a job description, the bullets are grounded in what this project genuinely demonstrates and optimised for that role."
                recommended
                onClick={() => onChoose({ intent: 'build' })}
              />
              <OptionCard
                icon={<GitMerge className="size-4.5" aria-hidden />}
                title="Link to an existing Project"
                description={linkDescription}
                disabled={!hasProjects}
                onClick={() => setMode('link')}
              />
              <OptionCard
                icon={<Database className="size-4.5" aria-hidden />}
                title="Add to knowledge base only"
                description="Sync and index the repository now without creating a Project. The code becomes searchable context straight away, and you can promote it to a Project later — useful while the work is still in progress, so you can wait until it is finished before generating a Project and tailoring your first resume to a job description."
                onClick={() => onChoose({ intent: 'none' })}
              />
            </div>
          ) : (
            <div className="mt-6 flex flex-col gap-3">
              <label htmlFor="link-project" className="text-sm font-medium text-zinc-300">
                Link to which Project?
              </label>
              <p className="text-xs text-zinc-500">
                The repository is added to the selected Project, which is then regenerated to include its code.
              </p>
              <select
                id="link-project"
                aria-label="existing project"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="rounded-md border border-white/10 bg-white/4 px-3 py-2 text-sm text-zinc-200"
              >
                <option value="">Select a Project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 flex items-center justify-between">
                <Button variant="ghost" onClick={() => setMode('pick')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs">
                  <ArrowLeft className="size-3.5" aria-hidden /> Back
                </Button>
                <Button
                  onClick={() => target && onChoose({ intent: 'link', targetProjectId: target })}
                  disabled={!target}
                  className="px-4 py-1.5 text-xs"
                >
                  Link repository
                </Button>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end border-t border-white/5 pt-4">
            <Button variant="ghost" onClick={onClose} className="px-3 py-1.5 text-xs">
              Cancel
            </Button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
