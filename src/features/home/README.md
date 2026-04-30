# tucaken Home page

Single direction — **energetic + spotlight + 3D resume + floating repos** (folds 02 and 03 from the design exploration).

## Files

```
src/features/home/
├── HomePage.tsx                 # default export, drop into src/app/index.tsx
├── content.ts                   # all copy
├── lib/
│   ├── MagneticButton.tsx       # springy CTA
│   ├── MeshBg.tsx               # animated radial-gradient mesh + grid
│   ├── Pipeline.tsx             # GitHub → AI → Resume diagram
│   └── RepoCard.tsx             # 3D-tilt repo card
└── sections/
    ├── HeroSection.tsx          # spotlight cursor + blur-fade headline + 3D resume preview + layered repos + pipeline + trusted-by
    └── Sections.tsx             # Problem, HowItWorks, Comparison, Founder, Pricing, FAQ, Footer
```

## Install

```bash
yarn add motion
```

(`motion` is the new package name for framer-motion v11+; we import from `motion/react`.)

## Wire into TanStack Router

Replace or create `src/app/index.tsx`:

```tsx
import { createFileRoute } from '@tanstack/react-router'
import { HomePage } from '@/features/home/HomePage'

export const Route = createFileRoute('/')({
  component: HomePage,
})
```

## Notes

- The hero is pinned dark (force `.dark` on the wrapper) so the gradient palette holds.
- Spotlight + 3D card use `useMotionValue` + `useSpring` + `useTransform` so they don't trigger React renders on every mousemove.
- All copy is in `content.ts`; tweak there, not in JSX.
- `MagneticButton` accepts `onClick` — wire CTAs to your auth flow (`navigate({ to: '/auth' })`).
