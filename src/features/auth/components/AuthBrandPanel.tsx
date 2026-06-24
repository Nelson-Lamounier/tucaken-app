"use client"
// Left split column (desktop only): Tucaken logo + founder quote over the
// FloatingPaths backdrop.
import { FloatingPaths } from './FloatingPaths'
import { founder } from '@/features/home/content'
import logoTeal from '@/images/logo-horizontal-resume-flat-teal.png'

export function AuthBrandPanel() {
  return (
    <div className="relative hidden h-full flex-col overflow-hidden border-r border-white/10 bg-zinc-950 p-10 lg:flex">
      {/* FloatingPaths inherit teal via the text colour here */}
      <div className="absolute inset-0 text-teal-300/70">
        <FloatingPaths position={1} />
        <FloatingPaths position={-1} />
      </div>
      <div className="absolute inset-0 z-10 bg-linear-to-t from-zinc-950 via-zinc-950/70 to-transparent" />

      <div className="z-10">
        <img src={logoTeal} alt="Tucaken Resume" className="h-10 w-auto" />
      </div>

      <div className="z-10 mt-auto max-w-md">
        <blockquote className="space-y-3">
          <p className="text-pretty text-lg leading-relaxed text-zinc-100">
            &ldquo;{founder.quote}&rdquo;
          </p>
          <footer className="font-mono text-sm text-zinc-400">
            ~ {founder.name} &middot; {founder.role}
          </footer>
        </blockquote>
      </div>
    </div>
  )
}
