import type { KbStats } from './kb-stats'

/** Where a greeting action sends the user. Kept as a small enum (not a raw
 *  path) so the component can render a correctly-typed router Link. */
export type ActionTarget = 'connect-repo' | 'upload-resume' | 'projects'

export interface SummaryAction {
  readonly label: string
  readonly target: ActionTarget
}

export interface DashboardSummary {
  readonly greeting: string
  readonly summary: string
  readonly action: SummaryAction | null
}

export interface SummaryInput {
  readonly name?: string | null
  readonly email?: string | null
  readonly stats: KbStats
  /** True when the user has at least one confirmed (curated) project. */
  readonly hasProject: boolean
  /** Profile-mirror paragraph, if synthesised — used as a positive note. */
  readonly mirror?: string | null
}

/** First name from a display name, else the email's local part, else "there". */
function firstName(name?: string | null, email?: string | null): string {
  const trimmed = name?.trim()
  if (trimmed) return trimmed.split(' ')[0]
  const local = (email ?? '').split('@')[0]
  return local.length > 0 ? local : 'there'
}

/** First sentence of a paragraph, kept short as a positive aside. */
function firstSentence(text: string): string {
  const trimmed = text.trim()
  const end = trimmed.search(/[.!?]/)
  return end === -1 ? trimmed : trimmed.slice(0, end + 1)
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm
}

/**
 * Pick a friendly greeting + one-line smart summary from the user's existing
 * signals. Mirrors the Setup panel's progression (connect repo -> upload resume
 * -> extract career -> KB ready) and adds "create a project" as the next step,
 * so the band keeps guiding users who are fully set up. First unmet step wins;
 * guard clauses keep the happy path flat. Deterministic — no AI, no network.
 */
export function deriveDashboardSummary(input: SummaryInput): DashboardSummary {
  const { name, email, stats, hasProject, mirror } = input
  const who = firstName(name, email)

  if (stats.failedImportCount > 0) {
    return {
      greeting: `Welcome back, ${who}`,
      summary: "No worries — let's get that resume back in. Re-upload it and Tucaken will take it from there.",
      action: { label: 'Re-upload resume', target: 'upload-resume' },
    }
  }
  if (stats.repoCount === 0) {
    return {
      greeting: `Welcome aboard, ${who}!`,
      summary: "Let's start by connecting a repository so Tucaken can learn from your work.",
      action: { label: 'Connect a repository', target: 'connect-repo' },
    }
  }
  if (stats.importCount === 0) {
    return {
      greeting: `Great progress, ${who}!`,
      summary: 'Add your resume next so Tucaken can map your experience.',
      action: { label: 'Upload resume', target: 'upload-resume' },
    }
  }
  if (stats.careerEntryCount === 0) {
    return {
      greeting: `Nice work, ${who}`,
      summary: 'Your resume is in — Tucaken is reading it now, so your career data will appear shortly.',
      action: null,
    }
  }
  if (!stats.isReady) {
    return {
      greeting: `Almost there, ${who}!`,
      summary: 'Your knowledge base is finishing up — tailored matches unlock in a moment.',
      action: null,
    }
  }
  if (!hasProject) {
    return {
      greeting: `You're all set up, ${who} — brilliant work!`,
      summary: 'Generate your first project from a repository, and Tucaken will build a tailored resume from any job description you give it.',
      action: { label: 'Generate a project', target: 'projects' },
    }
  }

  const note = mirror?.trim() ? ` ${firstSentence(mirror)}` : ''
  const repoWord = plural(stats.syncedRepoCount, 'repo', 'repos')
  const entryWord = plural(stats.careerEntryCount, 'career entry', 'career entries')
  return {
    greeting: `You're flying, ${who}!`,
    summary: `Tucaken is working across ${stats.syncedRepoCount} ${repoWord} and ${stats.careerEntryCount} ${entryWord}.${note}`,
    action: { label: 'View projects', target: 'projects' },
  }
}
