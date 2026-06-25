"use client"
// On-brand proof visuals for the scroll-story right panel. Pure presentational,
// dark/teal, no external assets. Keyed by MockKind via the MOCKS map so the
// section can render MOCKS[slide.mock] without a switch/ternary chain.
import type { MockKind } from './story-data'

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900/70 p-5 shadow-2xl shadow-black/40 backdrop-blur-md">
        {children}
      </div>
    </div>
  )
}

function CommitMock() {
  const cells = Array.from({ length: 35 }, (_, i) => i)
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">platform-eks · this month</div>
      <div className="mt-3 grid grid-cols-7 gap-1">
        {cells.map((i) => (
          <span
            key={i}
            className="aspect-square rounded-sm"
            style={{ background: `rgba(45,212,191,${0.12 + ((i * 7) % 9) * 0.09})` }}
          />
        ))}
      </div>
      <div className="mt-4 text-2xl font-bold text-white">47 commits</div>
      <div className="mt-1 text-[11px] text-zinc-500">Kubernetes autoscaling · zero-trust</div>
    </Frame>
  )
}

function ArchitectureMock() {
  const nodes = ['ingest', 'queue', 'worker', 'store']
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">event-driven migration · ADR-007</div>
      <div className="mt-4 flex items-center justify-between">
        {nodes.map((n, i) => (
          <div key={n} className="flex items-center">
            <div className="grid h-12 w-12 place-items-center rounded-lg border border-teal-500/30 bg-teal-500/10 font-mono text-[10px] text-teal-200">
              {n}
            </div>
            {i < nodes.length - 1 && <span className="mx-1 h-px w-4 bg-teal-400/40" />}
          </div>
        ))}
      </div>
      <div className="mt-4 text-2xl font-bold text-white">83 PRs · 99.95%</div>
      <div className="mt-1 text-[11px] text-zinc-500">6 months, legacy → event-sourced</div>
    </Frame>
  )
}

function SkimMock() {
  const lines = [80, 60, 70, 45, 65, 50]
  return (
    <Frame>
      <div className="flex items-center justify-between">
        <div className="font-mono text-[11px] text-zinc-500">resume.pdf</div>
        <div className="rounded-full bg-red-400/15 px-2 py-0.5 font-mono text-[10px] text-red-300">6s scan</div>
      </div>
      <div className="mt-4 space-y-2 opacity-40">
        {lines.map((w, i) => (
          <div key={i} className="h-2 rounded bg-zinc-600" style={{ width: `${w}%` }} />
        ))}
      </div>
      <div className="mt-4 text-[11px] text-zinc-500">Skimmed in seconds — your real work never read.</div>
    </Frame>
  )
}

const SAMPLE_REPOS = [
  { name: 'platform-eks', lang: 'YAML', color: '#2dd4bf' },
  { name: 'cost-optimiser', lang: 'Go', color: '#34d399' },
  { name: 'kafka-migration', lang: 'Rust', color: '#22d3ee' },
]

function ReposMock() {
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">Tucaken is reading…</div>
      <div className="mt-3 space-y-2">
        {SAMPLE_REPOS.map((r) => (
          <div key={r.name} className="flex items-center gap-2 rounded-lg border border-white/10 bg-zinc-900/70 px-3 py-2">
            <span className="h-2 w-2 rounded-full" style={{ background: r.color }} />
            <span className="font-mono text-[11px] text-zinc-300">{r.name}</span>
            <span className="ml-auto rounded bg-white/5 px-1.5 py-0.5 font-mono text-[9px] text-zinc-300">{r.lang}</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

function JdMock() {
  const reqs = [
    { t: 'Scale Kubernetes in production', hit: true },
    { t: 'Event-driven architecture', hit: true },
    { t: 'Strong communication', hit: false },
    { t: 'Cost optimisation', hit: true },
  ]
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">Job description · matched</div>
      <div className="mt-3 space-y-2">
        {reqs.map((r) => (
          <div
            key={r.t}
            className={[
              'rounded-lg border px-3 py-2 text-[12px]',
              r.hit ? 'border-teal-500/40 bg-teal-500/10 text-teal-100' : 'border-white/10 bg-white/[0.02] text-zinc-500',
            ].join(' ')}
          >
            {r.hit ? '✓ ' : '· '}{r.t}
          </div>
        ))}
      </div>
    </Frame>
  )
}

function ResumeMock() {
  const bullets = [
    'Scaled EKS to 99.95% uptime',
    'Migrated to event-driven · 83 PRs',
    'Cut spot-fleet cost −38%',
  ]
  return (
    <Frame>
      <div className="font-mono text-[11px] text-zinc-400">resume.pdf · verifiable</div>
      <div className="mt-3 space-y-2">
        {bullets.map((b) => (
          <div key={b} className="flex items-start gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
            <span className="mt-0.5 text-teal-400">✓</span>
            <span className="text-[12px] text-zinc-200">{b}</span>
            <span className="ml-auto font-mono text-[9px] text-teal-300/80 underline">evidence</span>
          </div>
        ))}
      </div>
    </Frame>
  )
}

export const MOCKS: Record<MockKind, () => React.JSX.Element> = {
  commit: CommitMock,
  architecture: ArchitectureMock,
  skim: SkimMock,
  repos: ReposMock,
  jd: JdMock,
  resume: ResumeMock,
}
