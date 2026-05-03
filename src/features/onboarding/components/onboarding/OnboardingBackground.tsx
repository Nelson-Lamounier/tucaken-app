// src/features/onboarding/components/OnboardingBackground.tsx
//
// Atmospheric background for the onboarding shell — a soft teal radial
// glow + a subtle dotted grid. Mirrors the aesthetic of the energetic
// AuthShell so the welcome flow feels like a continuation of sign-up.

export function OnboardingBackground() {
  return (
    <>
      {/* Subtle grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:48px_48px] dark:opacity-100"
      />

      {/* Teal radial glow, top-left */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(20 184 166) 0%, transparent 60%)',
        }}
      />

      {/* Emerald radial glow, bottom-right */}
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -right-40 h-[500px] w-[500px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgb(16 185 129) 0%, transparent 60%)',
        }}
      />
    </>
  )
}
