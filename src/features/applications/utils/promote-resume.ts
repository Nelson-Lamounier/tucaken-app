import type { ResumeData } from '@/lib/resumes/resume-data'

interface ResumeLike { readonly resumeId: string; readonly label: string }
type GetResumes = () => Promise<ResumeLike[]>
type CreateResume = (args: { data: { label: string; data: Record<string, unknown> } }) => Promise<{ resumeId: string }>

/** Find a saved resume by deterministic label, else create one. Returns its id. */
export async function resolveResumeId(
  input: { label: string; data: ResumeData },
  getResumes: GetResumes,
  createResume: CreateResume,
): Promise<string> {
  const existing = await getResumes()
  const match = existing.find((r) => r.label === input.label)
  if (match) return match.resumeId
  const created = await createResume({
    data: { label: input.label, data: input.data as unknown as Record<string, unknown> },
  })
  return created.resumeId
}
