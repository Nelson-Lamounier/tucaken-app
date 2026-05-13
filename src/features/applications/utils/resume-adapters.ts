import type { ResumeData as AppResumeData } from '@/lib/resumes/resume-data'
import {
  uid,
  DEFAULT_STATE,
  type AppState,
  type ResumeData as BuilderResumeData,
  type CoverLetterData,
} from '@/features/resume-theme/app/state'

/**
 * Maps the application's tailored resume data + cover letter string into
 * the resume builder's full AppState so the builder can be pre-populated.
 */
export function mapApplicationToBuilderState(
  appResume: AppResumeData,
  coverLetter: string | null,
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
      bullets: [],
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
    sectionOrder: [
      'summary',
      'experience',
      'projects',
      'education',
      'skills',
      'certifications',
    ],
  }

  const cover = parseCoverLetterString(
    coverLetter,
    appResume.profile.name,
    company,
    role,
  )

  return { ...DEFAULT_STATE, resume, cover }
}

function parseCoverLetterString(
  text: string | null,
  authorName: string,
  company: string,
  role: string,
): CoverLetterData {
  const base: CoverLetterData = {
    recipientName: 'Hiring Manager',
    recipientTitle: `${role}`,
    company,
    companyAddress: '',
    date: new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }),
    greeting: 'Dear Hiring Manager,',
    body: text ?? '',
    closing: `Sincerely,\n${authorName}`,
    jobDescription: '',
  }

  if (!text) return base

  const lines = text.split('\n').map((l) => l.trim())
  const nonEmpty = lines.filter(Boolean)

  // Extract greeting — first line starting with "Dear"
  const greetingIdx = nonEmpty.findIndex((l) =>
    l.toLowerCase().startsWith('dear '),
  )
  if (greetingIdx !== -1) {
    base.greeting = nonEmpty[greetingIdx]
  }

  // Extract closing — last block starting with common sign-offs
  const closingKeywords = [
    'sincerely',
    'best regards',
    'regards',
    'yours truly',
    'warm regards',
    'best,',
  ]
  let closingIdx = -1
  for (let i = nonEmpty.length - 1; i >= 0; i--) {
    if (closingKeywords.some((k) => nonEmpty[i].toLowerCase().startsWith(k))) {
      closingIdx = i
      break
    }
  }

  if (greetingIdx !== -1 && closingIdx > greetingIdx) {
    // Body is everything between greeting and closing
    const bodyLines = nonEmpty.slice(greetingIdx + 1, closingIdx)
    base.body = bodyLines
      .reduce<string[]>((acc, line) => {
        if (line === '' && acc.length > 0 && acc[acc.length - 1] !== '') {
          acc.push('')
        } else if (line !== '') {
          acc.push(line)
        }
        return acc
      }, [])
      .join('\n')
    base.closing = nonEmpty.slice(closingIdx).join('\n')
  } else if (greetingIdx !== -1) {
    base.body = nonEmpty.slice(greetingIdx + 1).join('\n')
  }

  return base
}
