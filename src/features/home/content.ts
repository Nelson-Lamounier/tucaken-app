// src/features/home/content.ts
export const hero = {
  eyebrow: 'For developers in active job search',
  primaryCta: 'Try it free with your GitHub',
  secondaryCta: 'See a live demo',
  sub: 'Tucaken reads your actual code, your real architecture decisions, and your shipped projects — then writes a resume that recruiters can verify. No more generic AI fluff. No more resumes that read nothing like the engineer who wrote them.',
  founderNote: 'Built by a DevOps engineer who used it to land his next role.',
}

export const problems = [
  { real: 'Your GitHub has 47 commits this month proving you can scale Kubernetes clusters.', deflated: 'Your resume just says "experienced with containerisation."' },
  { real: 'You spent 6 months migrating a legacy system to event-driven architecture.', deflated: 'Your resume just says "implemented modern patterns."' },
  { real: 'Recruiters scan resumes for 6 seconds.', deflated: 'They never see what you actually built.' },
] as const

export const steps = [
  { n: '01', t: 'Connect your GitHub', d: 'Tucaken reads your repositories, your architecture decisions, your shipped features.' },
  { n: '02', t: 'Paste a job description', d: 'Tucaken matches the requirements against what you have actually built.' },
  { n: '03', t: 'Get a resume recruiters can verify', d: 'Every claim links to real evidence from your work.', emp: true },
] as const

export const comparison = [
  { q: 'What is your evidence for this claim?', o: '"It seemed like a reasonable thing to say."', t: 'Points to your specific commit, file, or architecture decision.' },
  { q: 'Can you tailor for a Kubernetes role?', o: 'Generic Kubernetes language.', t: 'Pulls your actual K8s work — the cluster you ran, the issues you solved.' },
  { q: 'What if my repos have thin docs?', o: 'Generates plausible content anyway.', t: 'Tells you which repos need better docs and how to improve them.' },
  { q: 'Will this resume sound like me?', o: 'Trained on millions of generic resumes.', t: 'Trained on the documentation you wrote about systems you built.' },
] as const

export const founder = {
  name: 'Nelson',
  role: 'DevOps engineer · Dublin',
  quote: 'I built Tucaken because every resume tool I tried produced something that did not sound like me. I had years of real work in my GitHub that no tool could read. Tucaken is the tool I built for myself — I use it for my own job search every day.',
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
  { name: 'k8s-cluster-platform', desc: 'Kubernetes platform · 12k LOC', meta: '47 commits · 6 contributors', lang: 'Go', color: '#00ADD8' },
  { name: 'event-driven-migration', desc: 'Legacy → event-sourced services', meta: '83 PRs · 99.95% uptime', lang: 'TS', color: '#3178C6' },
  { name: 'iac-aws-pipelines', desc: 'Terraform + GitHub Actions', meta: '18 envs · 0 drift', lang: 'HCL', color: '#7B42BC' },
  { name: 'observability-stack', desc: 'Grafana + Loki + Tempo', meta: '14 dashboards', lang: 'Py', color: '#FFD43B' },
] as const
