// src/features/home/content.ts
export const hero = {
  eyebrow: 'Try for free',
  headlineLead: 'GenAI resumes that are',
  rotatingWords: ['evidence-backed', 'matched to the job', 'ready in minutes', 'honest about your skills'],
  primaryCta: 'Connect GitHub — see your evidence',
  secondaryCta: 'How it works',
  sub: 'Connect your GitHub with read-only access. Tucaken verifies the skills your code actually proves, matches them to any job description, and writes a tailored resume in minutes. Apply to the right roles with real evidence behind every claim, not generic AI guesswork.',
  ctaNote: 'No credit card required · revoke access anytime',
  founderNote: 'Built by an engineer using it for his own job search.',
}

export const problems = [
  {
    real: 'Your GitHub shows 47 commits this month scaling Kubernetes clusters in production.',
    says: 'Your resume reduces it to',
    struck: '"experienced with containerisation"',
    cost: 'so the proof of what you can really do never gets read.',
  },
  {
    real: 'You rebuilt a monolith into event-driven microservices over six months. 83 pull requests, zero downtime at cutover.',
    says: 'Your resume flattens it to',
    struck: '"implemented modern patterns"',
    cost: 'and recruiters skim straight past the proof.',
  },
  {
    real: 'A recruiter spends about six seconds scanning your resume before they decide.',
    says: 'All they register is',
    struck: '"a results driven team player"',
    cost: 'while the systems you designed, scaled and shipped stay invisible.',
  },
] as const

export const steps = [
  { n: '01', t: 'Connect your GitHub', d: 'Connect your GitHub account with read-only access and choose which repositories to sync. Tucaken AI scans your code for skills, keywords and architecture decisions, ingests it into your Knowledge Base, and extracts a per-skill evidence ledger: verified, partial or gap.' },
  { n: '02', t: 'Paste a job description', d: 'Paste any job description and Tucaken AI reads it into a clear list of required skills, then matches each one against your verified GitHub evidence. You see exactly where you are a strong fit, where you partially match and where the gaps are, before you apply.' },
  { n: '03', t: 'Get a resume recruiters can verify', d: 'Tucaken AI writes a job-tailored resume where every skill and bullet links back to real evidence in your code. Recruiters can verify each claim, so you apply with proof instead of buzzwords.', emp: true },
] as const

export type ComparisonItem = {
  label: string
  icon: string
  q: string
  o: string
  t: string
}

export const comparison: readonly ComparisonItem[] = [
  { label: 'Evidence', icon: 'FileSearch', q: 'What is your evidence for this claim?', o: '"It seemed like a reasonable thing to say."', t: 'Points to your specific commit, file, or architecture decision.' },
  { label: 'Tailoring', icon: 'Target', q: 'Can you tailor for a Kubernetes role?', o: 'Generic Kubernetes language.', t: 'Pulls your actual K8s work — the cluster you ran, the issues you solved.' },
  { label: 'Thin docs', icon: 'FileWarning', q: 'What if my repos have thin docs?', o: 'Generates plausible content anyway.', t: 'Tells you which repos need better docs and how to improve them.' },
  { label: 'Sounds like you', icon: 'Fingerprint', q: 'Will this resume sound like me?', o: 'Trained on millions of generic resumes.', t: 'Trained on the documentation you wrote about systems you built.' },
]

export const founder = {
  name: 'Nelson',
  role: 'DevOps engineer · Dublin',
  quote: 'I built Tucaken Resumes because every resume tool I tried produced something that did not sound like me. I had years of real work in my GitHub that no tool could read. Tucaken is the tool I built for myself — I use it for my own job search every day.',
}

export const pricing = [
  { name: 'Free', price: '€0', period: 'forever', items: ['Connect 3 repositories', '5 resumes per month', 'All core features'], cta: 'Start free', hl: false },
  { name: 'Pro', price: '€12', period: 'per month', items: ['Unlimited repositories (incl. private)', 'Unlimited resumes & cover letters', 'Per-phase interview coaching', 'Application tracker'], cta: 'Go Pro', hl: true },
] as const

export const faq = [
  { q: 'Will recruiters know my resume was AI-generated?', a: 'The output is grounded in your actual work, so it sounds like you wrote it about systems you built. No generic AI tone. Always review and edit before sending.' },
  { q: 'What if my repos are private or thin on docs?', a: 'Tucaken works on private repos via secure GitHub OAuth. For thin docs, it shows a quality score per repo and suggests improvements.' },
  { q: 'How is this different from ChatGPT?', a: 'ChatGPT cannot read your repositories. Tucaken reads your actual code and writes from there.' },
  { q: 'Is my code data safe?', a: 'Tucaken only reads documentation and metadata — README files, commit messages, architecture docs. Source code is not stored. GitHub access is read-only and revocable.' },
] as const

export const interviewedAt = ['AWS', 'Google', 'Stripe', 'Cloudflare', 'Datadog', 'Vercel'] as const

export const repos = [
  { name: 'platform-eks', desc: 'Zero-trust network policies, autoscaling', meta: 'PR #284 · merged', lang: 'YAML', color: '#2dd4bf' },
  { name: 'cost-optimiser', desc: 'Spot-fleet scheduler, −38% spend', meta: '14 commits this week', lang: 'Go', color: '#34d399' },
  { name: 'kafka-migration', desc: 'Event backbone cutover · ADR-007', meta: '99.95% uptime', lang: 'Rust', color: '#22d3ee' },
  { name: 'tucaken-app', desc: 'TanStack Start SSR web app', meta: 'main · green', lang: 'TS', color: '#5eead4' },
  { name: 'rds-bootstrap', desc: 'Aurora DSQL migrations, IAM auth', meta: 'release v2.1', lang: 'SQL', color: '#2dd4bf' },
] as const
