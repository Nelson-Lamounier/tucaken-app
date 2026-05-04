// src/features/onboarding/components/CarouselVisual.tsx
//
// Right-column visuals shown alongside each carousel slide.
// Three "kinds": code (commit list), portfolio (browser frame),
// resume (document preview), or the setup-tour grid for the
// checklist slide.

import { Globe, FileText, Code2 } from 'lucide-react'

interface Props {
  kind: 'hero' | 'value' | 'checklist'
  visual?: 'code' | 'resume' | 'portfolio'
}

export function CarouselVisual({ kind, visual }: Props) {
  if (kind === 'checklist') return <SetupTour />
  if (visual === 'code') return <CodeVisual />
  if (visual === 'portfolio') return <PortfolioVisual />
  return <ResumeVisual />
}

function SetupTour() {
  const items = [
    { label: 'Portfolio', icon: Globe },
    { label: 'Resume', icon: FileText },
    { label: 'GitHub', icon: Code2 },
  ]
  return (
    <div className="flex h-full flex-col rounded-lg border border-white/10 bg-zinc-900/60 p-4">
      <div className="mb-3 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
        Setup tour
      </div>
      <div className="grid flex-1 grid-cols-3 gap-2">
        {items.map(({ label, icon: Icon }) => (
          <div
            key={label}
            className="flex flex-col items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] py-3 text-zinc-400"
          >
            <Icon className="size-5" strokeWidth={1.5} />
            <span className="text-[10px] text-zinc-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CodeVisual() {
  const commits = [
    { sha: '4a7c9e2', msg: 'feat: add streaming token renderer' },
    { sha: 'b1f23da', msg: 'fix: handle empty changelog edge-case' },
    { sha: '8e0d4f1', msg: 'refactor: extract auth middleware' },
  ]
  return (
    <div className="h-full rounded-lg border border-white/10 bg-zinc-950/80 p-3 font-mono text-[10px]">
      <div className="mb-2 flex items-center gap-1.5 text-zinc-500">
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="ml-2 text-[9px]">main · 142 commits</span>
      </div>
      <ul className="space-y-1.5">
        {commits.map((c) => (
          <li key={c.sha} className="flex items-baseline gap-2">
            <span className="text-teal-400">{c.sha}</span>
            <span className="truncate text-zinc-400">{c.msg}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PortfolioVisual() {
  return (
    <div className="h-full overflow-hidden rounded-lg border border-white/10 bg-zinc-900/60">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-2">
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="size-2 rounded-full bg-zinc-700" />
        <span className="ml-2 font-mono text-[9px] text-zinc-500">yourname.dev</span>
      </div>
      <div className="space-y-2 p-4">
        <div className="h-2.5 w-3/4 rounded bg-white/10" />
        <div className="h-2 w-1/2 rounded bg-white/5" />
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          <div className="h-8 rounded bg-teal-500/20" />
          <div className="h-8 rounded bg-white/5" />
          <div className="h-8 rounded bg-white/5" />
        </div>
      </div>
    </div>
  )
}

function ResumeVisual() {
  return (
    <div className="h-full rounded-lg border border-white/10 bg-zinc-50/95 p-4 text-zinc-900">
      <div className="mb-2 h-2 w-1/2 rounded bg-zinc-900" />
      <div className="mb-3 h-1.5 w-1/3 rounded bg-zinc-400" />
      <div className="space-y-1">
        <div className="h-1 w-full rounded bg-zinc-300" />
        <div className="h-1 w-5/6 rounded bg-zinc-300" />
        <div className="h-1 w-4/6 rounded bg-zinc-300" />
      </div>
      <div className="mt-3 flex gap-1">
        <span className="rounded bg-teal-500/20 px-1.5 py-0.5 text-[8px] font-medium text-teal-700">verified</span>
        <span className="rounded bg-zinc-200 px-1.5 py-0.5 text-[8px] font-medium text-zinc-600">2024</span>
      </div>
    </div>
  )
}
