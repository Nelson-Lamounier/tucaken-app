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
        <img src={logoTeal} alt="Tucaken Resume" className="h-20 w-auto md:h-24" />
      </div>

      <div className="z-10 mt-auto max-w-xl">
        <blockquote>
          <p aria-hidden className="text-7xl leading-none font-black text-teal-300/80">
            &ldquo;
          </p>
          <p className="mt-1 text-2xl leading-[1.2] font-extrabold tracking-tight text-balance text-zinc-300 sm:text-[2rem]">
            {founder.quote}
          </p>
          <footer className="mt-6 flex items-center gap-3 font-mono text-sm">
            <span aria-hidden className="h-px w-8 bg-teal-400/60" />
            <span className="font-semibold text-zinc-100">{founder.name}</span>
            <span className="text-zinc-500">{founder.role}</span>
          </footer>
        </blockquote>
      </div>
    </div>
  )
}
