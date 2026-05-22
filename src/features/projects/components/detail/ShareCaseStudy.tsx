import { useState } from 'react'
import { Check, Copy, Globe, Lock, Share2 } from 'lucide-react'
import { useGitHubInstallation } from '@/features/github/hooks/use-github-installation'
import { Section } from './Section'
import { InlineSelect } from './InlineSelect'
import { usePatchProject } from '../../server/mutations'
import type { ProjectVisibility } from '../../lib/types'

const VISIBILITY_OPTIONS: ReadonlyArray<{ value: ProjectVisibility; label: string }> = [
  { value: 'private',  label: 'Private' },
  { value: 'unlisted', label: 'Unlisted' },
  { value: 'public',   label: 'Public' },
]

export interface ShareCaseStudyProps {
  readonly projectId:  string
  readonly slug:       string
  readonly visibility: ProjectVisibility
}

export function ShareCaseStudy({ projectId, slug, visibility }: ShareCaseStudyProps) {
  const patch = usePatchProject(projectId)
  const { data: installation } = useGitHubInstallation()
  const username = installation?.accountLogin
  const [copied, setCopied] = useState(false)

  const isPublic = visibility === 'public'
  const url = username
    ? `${getOrigin()}/u/${username}/p/${slug}`
    : null

  const copy = async () => {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard denied — leave the field for manual copy.
    }
  }

  return (
    <Section
      icon={Share2}
      title="Share"
      subtitle="Public case studies are viewable by anyone with the link"
      action={
        <InlineSelect<ProjectVisibility>
          value={visibility}
          options={VISIBILITY_OPTIONS}
          ariaLabel="project visibility"
          onChange={(next) => patch.mutate({ visibility: next })}
        />
      }
    >
      {isPublic ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-teal-300">
            <Globe className="size-3.5" />
            This project is public.
          </div>
          {url ? (
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-white/5 px-2.5 py-1.5 font-mono text-xs text-zinc-300 inset-ring inset-ring-white/10">
                {url}
              </code>
              <button
                type="button"
                onClick={copy}
                aria-label="Copy public URL"
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-white/5 px-2.5 py-1.5 text-xs font-medium text-zinc-200 inset-ring inset-ring-white/10 transition-colors hover:bg-white/10"
              >
                {copied ? <Check className="size-3.5 text-teal-400" /> : <Copy className="size-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-zinc-500">
              Connect GitHub to generate the shareable URL.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Lock className="size-3.5" />
          Set visibility to Public to share a recruiter-facing link.
        </div>
      )}
      {patch.isError && (
        <p className="mt-2 text-xs text-rose-300">
          {patch.error instanceof Error ? patch.error.message : 'Update failed — change reverted'}
        </p>
      )}
    </Section>
  )
}

function getOrigin(): string {
  if (typeof window !== 'undefined') return window.location.origin
  return ''
}
