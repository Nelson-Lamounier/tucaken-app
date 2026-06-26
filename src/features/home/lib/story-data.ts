// Pure slide model for the HowItWorks+Problem scroll-story. Maps the existing
// `problems` + `steps` content into an ordered list of slides (3 problems then
// 3 steps) and provides the scroll-progress -> slide-index mapping.
import { problems, steps } from '../content'

export type MockKind = 'commit' | 'architecture' | 'skim' | 'repos' | 'jd' | 'resume'

export interface StorySlide {
  id: string
  phase: 'problem' | 'how'
  eyebrow: string
  title: string
  body: string
  mock: MockKind
  /** How-it-works slides only: the step number, rendered as a large numeral. */
  num?: string
  /** Problem slides only: the resume cliche that flattens the achievement. */
  says?: string
  struck?: string
  cost?: string
}

const PROBLEM_MOCKS: MockKind[] = ['commit', 'architecture', 'skim']
const STEP_MOCKS: MockKind[] = ['repos', 'jd', 'resume']

export function buildStorySlides(): StorySlide[] {
  const problemSlides: StorySlide[] = problems.map((p, i) => ({
    id: `problem-${i}`,
    phase: 'problem',
    eyebrow: 'The problem',
    title: p.real,
    body: `${p.says} ${p.struck} ${p.cost}`,
    says: p.says,
    struck: p.struck,
    cost: p.cost,
    mock: PROBLEM_MOCKS[i % PROBLEM_MOCKS.length],
  }))
  const stepSlides: StorySlide[] = steps.map((s, i) => ({
    id: `how-${s.n}`,
    phase: 'how',
    eyebrow: 'How it works',
    title: s.t,
    num: s.n,
    body: s.d,
    mock: STEP_MOCKS[i % STEP_MOCKS.length],
  }))
  return [...problemSlides, ...stepSlides]
}

/** Map a 0..1 scroll progress to a clamped integer slide index. */
export function activeIndexFromProgress(progress: number, count: number): number {
  if (count <= 0) return 0
  const idx = Math.floor(progress * count)
  if (idx < 0) return 0
  if (idx > count - 1) return count - 1
  return idx
}
