// src/features/onboarding/content.ts
//
// Copy for the warm tone direction selected from the canvas (Variant B).
// All user-facing strings live here so they can be localized later.

export const COPY = {
  welcome: {
    eyebrow: 'Welcome to Tucaken',
    title: "Let's set up something you'll actually be proud to send.",
    sub: "We'll connect your code and your career so every line of your resume has receipts. Three quick steps — about three minutes.",
    cta: 'Get started',
  },
  portfolio: {
    eyebrow: 'Step 2 of 5 · optional',
    title: 'Where do you live online?',
    sub: 'Paste the link to your portfolio, personal site, or LinkedIn. We use it to ground future articles in your existing voice.',
    placeholder: 'yourname.dev',
    skipNote: "It's totally fine to add this later in Settings.",
  },
  resume: {
    eyebrow: 'Step 1 of 3 · optional',
    title: 'Have an existing resume? Bring it.',
    sub: "We'll pull out your roles, dates, and skills so you don't have to re-type them. PDFs and Word docs both work.",
    skipNote: "No resume yet? No problem — we'll generate one from your code.",
  },
  connect: {
    eyebrow: 'Step 2 of 3',
    title: 'Connect your GitHub.',
    sub: "We index your repos so resumes cite real commits and pull requests. Read-only — you can revoke access anytime.",
  },
  repos: {
    // Connect + Repositories share one onboarding step, but read as two phases
    // to the user: GitHub auth ("Step 2 of 3") then repo selection here, which
    // advances the counter to "Step 3 of 3".
    eyebrow: 'Step 3 of 3',
    title: 'Connect your repositories.',
    sub: 'Select which GitHub repos to index. Tucaken kicks off ingestion and enriches each previous role against your actual commit history.',
  },
} as const

export interface CarouselSlide {
  kind: 'hero' | 'value' | 'checklist'
  title: string
  body: string
  /** Used by the carousel to render a matching visual on the right. */
  visual?: 'code' | 'resume' | 'portfolio'
  items?: Array<{ label: string; time: string }>
}

export const CAROUSEL_SLIDES: CarouselSlide[] = [
  {
    kind: 'hero',
    title: 'Resumes that cite your code.',
    body: 'Tucaken indexes your repos and ties bullet points to real commits, PRs, and shipped work.',
    visual: 'code',
  },
  {
    kind: 'value',
    title: 'Articles in your own voice.',
    body: 'Drafts pull from your portfolio so what we generate sounds like you wrote it.',
    visual: 'portfolio',
  },
  {
    kind: 'value',
    title: "An agent that doesn't make things up.",
    body: 'Every claim is grounded in your real career history and codebase. No invented bullet points.',
    visual: 'resume',
  },
  {
    kind: 'checklist',
    title: "Here's what we'll set up together.",
    body: 'Three quick steps. You can skip any of them and come back later.',
    items: [
      { label: 'Link your portfolio site', time: '30 seconds' },
      { label: 'Import your existing resume', time: '1 minute' },
      { label: 'Connect GitHub', time: '1 minute' },
    ],
  },
]
