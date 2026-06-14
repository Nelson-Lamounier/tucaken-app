import type { ResumeProfile } from '@/lib/resumes/resume-data'
import type { CoverLetter } from '@/lib/types/applications.types'
import { toHref } from '@/lib/resumes/resume-dom-builder'

interface CoverLetterDocumentProps {
  coverLetter: CoverLetter
  profile?: ResumeProfile
  targetCompany?: string
  targetRole?: string
}

export function CoverLetterDocument({
  coverLetter,
  profile,
  targetCompany,
  targetRole,
}: CoverLetterDocumentProps) {
  const date = new Date().toLocaleDateString('en-IE', { year: 'numeric', month: 'long', day: 'numeric' })
  const recipientBlock = targetCompany ? ['Hiring Manager', targetCompany] : ['Hiring Manager']

  return (
    <div className="mx-auto w-[794px] font-['Helvetica_Neue',_Helvetica,_Arial,_sans-serif] leading-snug">
      <div className="w-[794px] min-h-[1123px] bg-white text-zinc-900 relative">

        {/* ──── LETTERHEAD ──── */}
        {profile ? (
          <header className="px-10 pt-10 pb-6 border-b-[1.5px] border-zinc-800">
            <h1 className="text-[24px] font-bold tracking-tight text-zinc-900">
              {profile.name}
            </h1>
            <p className="mt-1 text-[13px] font-medium text-zinc-600 tracking-wide uppercase">
              {profile.title}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 text-[10px] text-zinc-600">
              <span>{profile.location}</span>
              <span className="text-zinc-300">|</span>
              <a href={toHref(profile.email)} className="hover:underline">{profile.email}</a>
              <span className="text-zinc-300">|</span>
              <a href={toHref(profile.linkedin)} className="hover:underline">{profile.linkedin}</a>
              <span className="text-zinc-300">|</span>
              <a href={toHref(profile.github)} className="hover:underline">{profile.github}</a>
              <span className="text-zinc-300">|</span>
              <a href={toHref(profile.website)} className="hover:underline">{profile.website}</a>
            </div>
          </header>
        ) : (
          <header className="px-10 pt-10 pb-6 border-b-[1.5px] border-zinc-800">
            <p className="text-[13px] font-semibold text-zinc-500 uppercase tracking-widest">
              Cover Letter
            </p>
          </header>
        )}

        <div className="px-10 py-8 space-y-5">

          {/* ──── DATE ──── */}
          <p className="text-[10.5px] text-zinc-600">{date}</p>

          {/* ──── RECIPIENT BLOCK ──── */}
          <div className="space-y-0.5">
            {recipientBlock.map((line) => (
              <p key={line} className="text-[10.5px] text-zinc-800 leading-[1.6]">
                {line}
              </p>
            ))}
            {targetRole && (
              <p className="text-[10.5px] text-zinc-800 leading-[1.6]">
                Re: <span className="font-medium">{targetRole}</span>
              </p>
            )}
          </div>

          {/* ──── GREETING ──── */}
          {coverLetter.greeting && (
            <p className="text-[10.5px] text-zinc-900 font-medium pt-1">
              {coverLetter.greeting}
            </p>
          )}

          {/* ──── BODY PARAGRAPHS ──── */}
          <div className="space-y-4">
            {coverLetter.paragraphs.map((paragraph) => (
              <p
                key={paragraph.slice(0, 24)}
                className="text-[10.5px] leading-[1.75] text-zinc-800"
              >
                {paragraph}
              </p>
            ))}
          </div>

          {/* ──── SIGNOFF ──── */}
          <div className="pt-2 space-y-6">
            <p className="text-[10.5px] text-zinc-900">Sincerely,</p>
            <div>
              <p className="text-[10.5px] font-semibold text-zinc-900">
                {coverLetter.signoff.name || profile?.name}
              </p>
              {profile?.title && (
                <p className="text-[10px] text-zinc-500 mt-0.5">{profile.title}</p>
              )}
              {coverLetter.signoff.email && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  <a href={toHref(coverLetter.signoff.email)} className="hover:underline">
                    {coverLetter.signoff.email}
                  </a>
                </p>
              )}
              {coverLetter.signoff.linkedin && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  <a href={toHref(coverLetter.signoff.linkedin)} className="hover:underline">
                    {coverLetter.signoff.linkedin}
                  </a>
                </p>
              )}
              {coverLetter.signoff.github && (
                <p className="text-[10px] text-zinc-500 mt-0.5">
                  <a href={toHref(coverLetter.signoff.github)} className="hover:underline">
                    {coverLetter.signoff.github}
                  </a>
                </p>
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
