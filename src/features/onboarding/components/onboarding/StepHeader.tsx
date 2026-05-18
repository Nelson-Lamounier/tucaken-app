/** @format */

// src/features/onboarding/components/StepHeader.tsx
//
// Eyebrow + title + sub block used at the top of every onboarding step.

import { Typewriter } from "@/components/ui/Typewriter";

interface Props {
  eyebrow?: string;
  title: string;
  sub?: string;
  /** When true, title + sub reveal with the Typewriter change-content effect. */
  typewriter?: boolean;
  /** Fired when the typewriter finishes (the sub if present, else the title).
   *  Only relevant when `typewriter` is true. */
  onTypingComplete?: () => void;
}

const TITLE_SPEED = 55; // ms per char

export function StepHeader({
  eyebrow,
  title,
  sub,
  typewriter,
  onTypingComplete,
}: Readonly<Props>) {
  const titleClass = typewriter
    ? "text-4xl font-bold leading-[1.1] text-zinc-50 md:text-5xl"
    : "text-balance text-2xl font-semibold leading-[1.15] text-zinc-50 md:text-3xl";
  const subClass = typewriter
    ? "mt-5 max-w-[60ch] text-lg leading-relaxed text-zinc-300 md:text-2xl"
    : "mt-3 max-w-[58ch] text-pretty text-sm leading-relaxed text-zinc-400";

  return (
    <div className="mb-6">
      {eyebrow && (
        <div
          className={
            typewriter
              ? 'mb-3 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/2 px-3.5 py-1.5 text-sm font-medium tracking-wide text-zinc-300 md:text-base'
              : 'mb-2 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/10 bg-white/2 px-2.5 py-1 text-[10px] font-medium tracking-wide text-zinc-400'
          }
        >
          {eyebrow}
        </div>
      )}

      {typewriter ? (
        <>
          <Typewriter
            // Keying by text forces a fresh mount (and full replay) every
            // time the step changes — Next/Back/jump never share an
            // instance, so the typing effect always retriggers.
            key={`title:${title}`}
            as="h1"
            text={title}
            className={titleClass}
            speed={TITLE_SPEED}
            onComplete={sub ? undefined : onTypingComplete}
          />
          {sub && (
            <Typewriter
              key={`sub:${sub}`}
              as="p"
              text={sub}
              className={subClass}
              speed={40}
              // Start once the title has finished typing.
              startDelay={title.length * TITLE_SPEED + 250}
              onComplete={onTypingComplete}
            />
          )}
        </>
      ) : (
        <>
          <h1 className={titleClass}>{title}</h1>
          {sub && <p className={subClass}>{sub}</p>}
        </>
      )}
    </div>
  );
}
