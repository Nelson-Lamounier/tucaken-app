import { useEffect } from 'react'
import { Listbox, ListboxButton, ListboxOption, ListboxOptions } from '@headlessui/react'
import { ChevronUpDownIcon } from '@heroicons/react/16/solid'
import { CheckIcon } from '@heroicons/react/20/solid'
import { DocumentTextIcon } from '@heroicons/react/24/outline'
import { Wand2 } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useResumeVersions, type AdminResume } from '../hooks/use-resume-versions'

/** Empty string is a real, submittable value meaning "let the agent build a resume". */
const BUILD_FROM_SCRATCH = ''

export interface ResumeMenuSelectProps {
  /** `null` = default not yet resolved; `''` = build from scratch; otherwise a resume id. */
  readonly resumeId: string | null
  readonly onChange: (resumeId: string) => void
}

/** Active resume first, then most-recently-updated. */
function sortResumes(resumes: readonly AdminResume[]): AdminResume[] {
  return [...resumes].sort((a, b) => {
    if (a.isActive && !b.isActive) return -1
    if (!a.isActive && b.isActive) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })
}

export function ResumeMenuSelect({ resumeId, onChange }: ResumeMenuSelectProps) {
  const { data: resumes, isLoading } = useResumeVersions()
  const sorted = resumes ? sortResumes(resumes) : []

  // Resolve the default exactly once: only while resumeId is still unresolved (null).
  useEffect(() => {
    if (resumeId !== null || isLoading) return
    onChange(sorted.length > 0 ? sorted[0].resumeId : BUILD_FROM_SCRATCH)
  }, [resumeId, isLoading, sorted, onChange])

  if (isLoading || resumeId === null) {
    return (
      <div
        className="h-8 w-44 animate-pulse rounded-md bg-zinc-200 dark:bg-white/10"
        aria-label="Loading resumes"
      />
    )
  }

  const selected = sorted.find((r) => r.resumeId === resumeId)
  const buttonLabel = selected ? selected.label : 'Build from scratch with agent'

  return (
    <Listbox value={resumeId} onChange={onChange} as="div" className="relative">
      <ListboxButton className="inline-flex items-center gap-2 rounded-md bg-zinc-100 dark:bg-white/5 px-3 py-1.5 text-sm text-zinc-900 dark:text-white outline-1 -outline-offset-1 outline-zinc-300 dark:outline-white/10 hover:bg-zinc-200 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-500 transition-colors">
        {selected ? <DocumentTextIcon className="size-4 text-zinc-500" /> : <Wand2 className="size-4 text-violet-500" />}
        <span className="max-w-[12rem] truncate">{buttonLabel}</span>
        <ChevronUpDownIcon aria-hidden="true" className="size-4 text-zinc-400" />
      </ListboxButton>

      <ListboxOptions
        transition
        className="absolute right-0 z-20 mt-1 max-h-72 w-72 overflow-auto rounded-md bg-white dark:bg-zinc-800 py-1 text-sm shadow-lg ring-1 ring-zinc-200 dark:ring-white/10 data-leave:transition data-leave:duration-100 data-leave:ease-in data-closed:data-leave:opacity-0"
      >
        {sorted.map((resume) => (
          <ListboxOption
            key={resume.resumeId}
            value={resume.resumeId}
            className="group flex cursor-pointer items-center justify-between gap-2 px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-white/5"
          >
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-zinc-900 dark:text-white">{resume.label}</span>
                {resume.isActive && (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20 px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset">
                    Active
                  </span>
                )}
              </span>
              <span className="block text-xs text-zinc-500">
                Updated {new Date(resume.updatedAt).toLocaleDateString()}
              </span>
            </span>
            <CheckIcon className="size-4 text-teal-600 opacity-0 group-data-selected:opacity-100" />
          </ListboxOption>
        ))}

        <ListboxOption
          value={BUILD_FROM_SCRATCH}
          className="group flex cursor-pointer items-center justify-between gap-2 border-t border-zinc-200 dark:border-white/10 px-3 py-2 data-focus:bg-zinc-100 dark:data-focus:bg-white/5"
        >
          <span className="flex items-center gap-2 text-violet-600 dark:text-violet-400">
            <Wand2 className="size-4" />
            Build from scratch with agent
          </span>
          <CheckIcon className="size-4 text-teal-600 opacity-0 group-data-selected:opacity-100" />
        </ListboxOption>

        <div className="border-t border-zinc-200 dark:border-white/10 px-3 py-2">
          <Link
            to="/resumes/new"
            className="inline-flex items-center text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500"
          >
            Create new resume
            <span aria-hidden="true" className="ml-1">&rarr;</span>
          </Link>
        </div>
      </ListboxOptions>
    </Listbox>
  )
}
