# Yanish Gurung — Portfolio

A personal portfolio site for Yanish Gurung, Full-Stack Developer. The plan is a
walkable 3D world that leads into a fast, scroll-animated Recruiter view. The
current state is the project skeleton only: routes, content file and tooling.
The 3D world and animations are not built yet.

Stack: Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS v4, three.js
with React Three Fiber, GSAP, Lenis.

## Getting started

Requirements: Node 24 and npm 11.

```bash
npm install
npm run dev      # http://localhost:3000
```

Other scripts:

```bash
npm run build    # production build
npm run start    # serve the production build
npm run lint     # ESLint (flat config, eslint.config.mjs)
```

## Folder map

```
src/
  app/                 Routes (App Router). "/" and "/recruiter" for now.
  content/profile.ts   All site content. Placeholder data until real data is added.
  components/world/    Planned: 3D world components (R3F scene, characters, zones).
  components/recruiter/ Planned: Recruiter Mode components (scroll animations).
  store/               Planned: zustand stores (shared client state).
public/
  models/              Planned: compressed .glb models (characters, props).
```

## Content

Edit `src/content/profile.ts`. It is the single source for names, skills,
projects, education, certificates, courses and experience. Replace the
`PLACEHOLDER` values there; the types are exported from the same file.

See `ARCHITECTURE.md` for the routes, the planned 3D world and the Recruiter
split.
