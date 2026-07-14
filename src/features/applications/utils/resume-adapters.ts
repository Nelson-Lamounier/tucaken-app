import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'
import type { CoverLetter, CoverLetterSignoff } from '@/lib/types/applications.types'
import {
  uid,
  DEFAULT_STATE,
  type AppState,
  type ResumeData as BuilderResumeData,
  type CoverLetterData,
} from '@/features/resume-theme/app/state'

/** Builder section keys the strategist's sectionOrder may reference. */
const CANONICAL_SECTION_ORDER = [
  'summary',
  'experience',
  'projects',
  'education',
  'skills',
  'certifications',
] as const

const VALID_SECTION_KEYS = new Set<string>(CANONICAL_SECTION_ORDER)

/**
 * Resolve the builder section order from the strategist's emitted order
 * (restructure decision). Keeps only known keys; appends any canonical sections
 * the backend omitted so nothing is dropped. Falls back to canonical when the
 * backend provided nothing usable.
 */
function resolveSectionOrder(emitted: readonly string[] | undefined): string[] {
  const fromBackend = (emitted ?? []).filter((k) => VALID_SECTION_KEYS.has(k))
  if (fromBackend.length === 0) return [...CANONICAL_SECTION_ORDER]
  const seen = new Set(fromBackend)
  return [...fromBackend, ...CANONICAL_SECTION_ORDER.filter((k) => !seen.has(k))]
}

/**
 * Maps the application's tailored resume data + structured cover letter into
 * the resume builder's full AppState so the builder can be pre-populated.
 */
export function mapApplicationToBuilderState(
  appResume: AppResumeData,
  coverLetter: CoverLetter | null,
  company: string,
  role: string,
): AppState {
  const p = appResume.profile ?? {}
  const resume: BuilderResumeData = {
    profile: {
      name: (p as AppResumeData['profile']).name ?? '',
      title: (p as AppResumeData['profile']).title ?? '',
      email: (p as AppResumeData['profile']).email ?? '',
      phone: '',
      location: (p as AppResumeData['profile']).location ?? '',
      linkedin: (p as AppResumeData['profile']).linkedin ?? '',
      github: (p as AppResumeData['profile']).github ?? '',
      website: (p as AppResumeData['profile']).website ?? '',
    },
    summary: appResume.summary ?? '',
    experience: (appResume.experience ?? []).map((e) => ({
      id: uid(),
      title: e.title ?? '',
      company: e.company ?? '',
      location: '',
      period: e.period ?? '',
      bullets: Array.isArray(e.highlights) ? e.highlights : [],
    })),
    education: (appResume.education ?? []).map((e) => ({
      id: uid(),
      degree: e.degree ?? '',
      institution: e.institution ?? '',
      location: '',
      period: e.period ?? '',
      details: e.details ?? '',
    })),
    projects: (appResume.projects ?? []).map((proj) => ({
      id: uid(),
      name: proj.name ?? '',
      stack: '',
      url: proj.github ?? '',
      description: proj.description ?? '',
      bullets: Array.isArray(proj.highlights) ? proj.highlights : [],
    })),
    skills: (appResume.skills ?? []).map((s) => ({
      id: uid(),
      category: s.category ?? '',
      skills: Array.isArray(s.skills) ? s.skills.join(', ') : String(s.skills ?? ''),
    })),
    certifications: (appResume.certifications ?? []).map((c) => ({
      id: uid(),
      name: c.name ?? '',
      issuer: c.issuer ?? '',
      year: c.year ?? '',
    })),
    languages: [],
    custom: [],
    sectionOrder: resolveSectionOrder(appResume.sectionOrder),
  }

  const cover = mapStructuredCoverLetter(
    coverLetter,
    appResume.profile.name,
    company,
    role,
  )

  return { ...DEFAULT_STATE, resume, cover }
}

/**
 * Maps a structured CoverLetter object (from the pipeline) into the builder's
 * CoverLetterData shape. The builder owns all formatting — paragraphs are
 * joined with `\n\n` (the separator every renderer splits on), and the signoff
 * fields are assembled into the `closing` string.
 */
function mapStructuredCoverLetter(
  cl: CoverLetter | null,
  authorName: string,
  company: string,
  role: string,
): CoverLetterData {
  const base: CoverLetterData = {
    recipientName: 'Hiring Manager',
    recipientTitle: role,
    company,
    companyAddress: '',
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    greeting: 'Dear Hiring Manager,',
    body: '',
    closing: `Sincerely,\n${authorName}`,
    jobDescription: '',
  }

  if (!cl) return base

  base.greeting = cl.greeting
  base.body = cl.paragraphs.join('\n\n')

  const { name, email, linkedin, github } = cl.signoff
  const signoffLines = [name, email, linkedin, github].filter(Boolean)
  base.closing = `Sincerely,\n${signoffLines.join('\n')}`

  return base
}

/** Builder AppState → application ResumeData (inverse of mapApplicationToBuilderState). */
export function builderStateToResumeData(state: AppState): AppResumeData {
  const r = state.resume
  return {
    profile: {
      name: r.profile.name,
      title: r.profile.title,
      location: r.profile.location,
      email: r.profile.email,
      linkedin: r.profile.linkedin,
      github: r.profile.github,
      website: r.profile.website,
    },
    summary: r.summary,
    keyAchievements: [],
    experience: r.experience.map((e) => ({
      title: e.title,
      company: e.company,
      period: e.period,
      highlights: e.bullets,
    })) as AppResumeData['experience'],
    certifications: r.certifications.map((c) => ({
      name: c.name,
      issuer: c.issuer,
      year: c.year,
    })) as AppResumeData['certifications'],
    skills: r.skills.map((s) => ({
      category: s.category,
      skills: s.skills.split(',').map((t) => t.trim()).filter(Boolean),
    })) as AppResumeData['skills'],
    education: r.education.map((e) => ({
      degree: e.degree,
      institution: e.institution,
      period: e.period,
      details: e.details,
    })) as AppResumeData['education'],
    projects: r.projects.map((p) => ({
      name: p.name,
      github: p.url,
      description: p.description,
      highlights: p.bullets,
    })) as AppResumeData['projects'],
    sectionOrder: r.sectionOrder,
  }
}

/**
 * Builder AppState → CoverLetter. Greeting + paragraphs come from the builder's
 * edited cover; the structured signoff is preserved from the original (the builder
 * exposes signoff only as a freetext `closing`, so we do not parse it back).
 */
export function builderStateToCoverLetter(
  state: AppState,
  fallbackSignoff: CoverLetterSignoff,
): CoverLetter {
  const paragraphs = state.cover.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
  return {
    greeting: state.cover.greeting,
    paragraphs,
    signoff: fallbackSignoff,
  }
}
