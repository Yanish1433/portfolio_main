# Architecture

## Routes

| Route | File | Status |
|---|---|---|
| `/` | `src/app/page.tsx` | Placeholder: "3D world coming soon", link to `/recruiter` |
| `/recruiter` | `src/app/recruiter/page.tsx` | Placeholder: name and title from `profile.ts` |

Route files are Server Components. Anything that needs the browser (R3F canvas,
GSAP, Lenis, zustand consumers) goes in a client component marked `"use client"`
and is imported from a route.

## Folders

- `src/app/`: App Router routes, layout and global CSS.
- `src/content/`: `profile.ts`, the only content source. Exports the `Profile`
  type and the `profile` object.
- `src/components/world/`: planned 3D world (scene, walking controls, avatar,
  zones). Empty for now.
- `src/components/recruiter/`: planned Recruiter Mode sections with GSAP
  ScrollTrigger animations. Empty for now.
- `src/store/`: planned zustand stores for shared client state (avatar choice,
  current zone, UI mode). Empty for now.
- `public/models/`: planned Blender exports as compressed `.glb` files.

## Content source

All visible text and numbers come from `src/content/profile.ts`. Components
receive data as props or import `profile` directly. There is no CMS and no
fetch at runtime. Current values are placeholders.

## Planned split: 3D world and Recruiter Mode

- **`/` (3D world):** a full-screen R3F canvas. Click or tap to walk, with
  zones for projects, education and the robot buddy. Physics via
  `@react-three/rapier`, post effects via `@react-three/postprocessing`.
  Target: 60 fps on desktop, 30 fps or more on mobile.
- **`/recruiter` (Recruiter Mode):** a fast, plain HTML page with no 3D. It
  renders the same `profile` data, animated on scroll with GSAP ScrollTrigger
  and Lenis smooth scrolling. Target: usable in under 2 seconds, Lighthouse
  performance 95 or more, and respects `prefers-reduced-motion`.

Keeping Recruiter Mode separate from the 3D canvas keeps it light for
recruiters who only need the facts.

## Tooling

- Next.js 15, React 19, TypeScript (strict), Tailwind CSS v4.
- ESLint flat config in `eslint.config.mjs`; `npm run lint` runs `eslint .`.
- Import alias `@/*` maps to `src/*`.
