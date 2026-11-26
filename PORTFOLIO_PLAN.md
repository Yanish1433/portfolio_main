# Full-Stack Portfolio — Idea Research & Plan

## ⚠️ WHAT HAPPENS ON APPROVAL: SAVE ONLY, NO BUILDING
The user wants this plan saved for the development phase later. When this plan is approved, I will ONLY:
1. Save the full plan to project memory (`memory\portfolio-plan.md` + a line in `MEMORY.md`) so future sessions recall it
2. Create the Idea Vault (`memory\portfolio-idea-vault.md`) and `C:\portfolio11\IDEAS.md` for ideas the user sends later
3. Copy this plan to `C:\portfolio11\PORTFOLIO_PLAN.md`

I will NOT run Blender or write any code until the user says to start the development phase.

## 🎯 FIRST DEV TASK (later): build 2 Blender characters for review
The user asked me to create only 2 characters for now, which they will approve before we go further. Blender 5.2 is installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`, so I can build the characters with Python scripts run without opening the Blender window (`blender.exe --background --python <script>`).

**The 2 characters (genderless, stylized-realistic):**
1. **"Clay"**: a soft clay mannequin figure, with a rounded head (no facial features), smooth limbs and a matte clay material with subtle surface detail.
2. **"Astro"**: a small explorer in a padded suit with a chest panel and a backpack. A glass-and-metal helmet with a reflective visor hides the face.

**Steps:**
1. Create the project folder `C:\portfolio11\blender\`:
   - `scripts\common.py`: shared scene, lighting and material helpers, plus one shared rig
   - `scripts\make_clay.py` and `scripts\make_astro.py`: build each model from scratch
   - `scripts\render_preview.py`: preview images for review
2. Each script builds the model, gives it realistic materials (shine, roughness, metal, glass), adds a skeleton, sets a simple idle pose, and saves:
   - `blender\characters\clay.blend` / `astro.blend` (editable source)
   - `public\models\clay.glb` / `astro.glb` (for the website, target under 3 MB)
3. **Preview renders:** a front view and a 3/4 view of each character on a turntable stand with studio lights, saved to `blender\previews\*.png`. I'll show you these to approve.
4. Save the Idea Vault memory and `IDEAS.md` (deferred until plan mode is off).

**After you approve:** add animations (Mixamo walk/idle/wave on the shared skeleton) → the robot buddy → start the website (Phase 1 of the build plan below).

**Verification:**
- Both scripts run without errors when Blender runs in the background
- Both `.glb` files are under 3 MB and open in a glTF viewer
- The preview images are clean and you approve them

## Context
You want a full-stack developer portfolio that gets companies interested. For now this is ideas only. You'll also send ideas you find online, and I'll keep them so you can build them later. `C:\portfolio11` is empty, so we start from scratch.

### What the research says gets people hired (2026)
- **3–5 polished projects that are live online**, not 15 half-finished ones. Reviewers spend seconds, not minutes, and they won't run your code on their own machine.
- **Skip the tutorial clones**: todo, weather, calculator, Netflix or Spotify clones. Reviewers spot them right away.
- **Real problems, real data, real users**, plus numbers you can point to (response time, number of users, uptime).
- **Explain your decisions**: a short case study per project (problem → architecture → trade-offs → what you'd change).
- **Easy to check**: public repos, a clear README with a GIF, tests, CI, and API docs.
- **AI built into the product**, not bolted on, is now expected. But since AI makes generic projects cheap, being original and going deep is what stands out.

---

## A. The portfolio site itself: ADVANCED interactive concepts
The user rejected simple/editorial layouts. They want an advanced, animated, interactive site, with the AI chat as a core feature.
What 2026 award-level portfolios do (Awwwards / Codrops): scroll-driven 3D worlds (Three.js + GSAP ScrollTrigger), custom shaders, a hero that reacts to the cursor, cinematic transitions, and sometimes two modes (an immersive mode plus a quick "archive" mode). Bruno Simon's drivable 3D world is the best-known example.

1. **"Neural Core": the AI is the hero.** A living particle orb or brain made with a custom shader sits in the middle of the screen, and it *is* the chatbox. It pulses while it "thinks," shimmers as the answer streams in, and can react to voice. Ask "show me your real-time project" and the camera flies to that project's 3D planet while the AI explains it. Nobody else has the chat and the 3D scene working as one thing, so this stands out most.
2. **"Request City": full-stack as an explorable world.** An isometric 3D city. Frontend towers, API gateways, database vaults and Redis "fast lanes" are buildings, and glowing packets travel along roads to show your projects' architecture actually working. Click a building to open that project. This is the concept that most directly *proves full-stack skill* through visuals.
3. **"Mission Control OS": a sci-fi desktop.** A heads-up-display style operating system with draggable windows, a working terminal, live numbers from your deployed apps, and an AI "copilot" window. It's very interactive, and easier to build than full 3D.
4. **"The Journey of a Request": a cinematic scroll story.** As you scroll, the camera follows one click from the browser → CDN → API → queue → database and back. Each stop shows one of your projects and skills. Big text animations, video-like pacing.

**Recommendation:** **1 + 2 combined.** You land on the Neural Core AI, which acts as your guide. "Explore" zooms out into Request City, and the AI can fly you anywhere in it.
**Must-haves so it still gets you hired:**
- A "Recruiter mode" toggle: a fast 2D view with resume and links in one click
- Loads in under 3s, with a loading screen
- Respects reduced-motion settings
- A lighter version for phones
- Drop to simpler graphics automatically on weak GPUs

**Tech:**
- Next.js 15, React Three Fiber + drei, custom GLSL shaders
- GSAP (ScrollTrigger, SplitText), Lenis smooth scroll, Theatre.js for camera paths
- Blender/Spline for models
- Vercel AI SDK streaming chat, with answers drawn from your resume and repos stored in pgvector
- Web Speech API for voice, and optional WebGPU

---

## B. Flagship project ideas (pick 3–4)
Each one is full-stack, solves a real problem, and shows a skill companies care about.

| # | Idea | What it proves | Key tech |
|---|------|----------------|----------|
| 1 | **Real-time collaborative whiteboard / doc editor** (cursors, presence, offline sync) | Real-time systems, CRDTs, WebSockets | Next.js, Yjs, WebSocket/Liveblocks, Postgres, Redis |
| 2 | **SaaS starter that actually runs**: e.g. an appointment booking tool for local businesses (salons, clinics) with Stripe, multiple businesses on one app, an admin dashboard | Product thinking, payments, auth, roles | Next.js, Prisma, Postgres, Stripe, Clerk/Firebase Auth |
| 3 | **AI codebase explainer**: paste a GitHub repo and get an architecture map, Q&A and onboarding docs | Retrieval over code (RAG), background job queues, streaming | Node/Python, pgvector, queue (BullMQ), LLM API |
| 4 | **Uptime + incident monitor** (a small Better-Stack-style tool): pings URLs, sends alerts, has a status page | Background workers, cron jobs, notifications, reliability | Go/Node workers, Postgres, Redis, email/Slack webhooks |
| 5 | **Marketplace for a local niche** (e.g. used textbooks, tutors, freelancers in your city) | Search, image uploads, messaging, reviews | Next.js, Postgres full-text search, S3/Cloudinary, Socket.io |
| 6 | **Personal finance tracker with bank-CSV import + AI categorization** | Messy data parsing, charts, privacy, security | React, Express/NestJS, Postgres, charts |
| 7 | **Dev-tool: API mock/testing playground** (like a small Postman or Mockoon in the browser) | Developer experience, protocols, complex UI state | React, Node, OpenAPI parsing |
| 8 | **Event ticketing with QR check-in + a phone scanner app** | Concurrency (no double booking), mobile, payments | Next.js, React Native/PWA, Postgres transactions |
| 9 | **Multiplayer browser game with your own original design** (quiz/trivia battle, drawing game) | Real-time game state, lobbies, leaderboards | Socket.io, Redis, Canvas |
| 10 | **Open-source contribution / npm package** pulled out of one of the projects above | Collaboration, writing libraries, docs | TypeScript, GitHub Actions, npm |

### Suggested starter set (balanced)
- **#2 SaaS booking** (breadth: auth, payments, CRUD, roles)
- **#1 Real-time collaborative** (depth: hard engineering)
- **#3 AI codebase explainer** (it's 2026, and this one has AI in the product)
- **Bonus #10** once the others are done

---

## C. "Polish layer" that makes any project stand out
- Live demo with a **one-click demo login** (no sign-up wall for recruiters)
- README: GIF, architecture diagram, tech stack, "why I built this", trade-offs
- Tests + GitHub Actions CI badge; Lighthouse 90+; works on phone screens
- A real user count or feedback ("used by 12 salons", "40 GitHub stars")
- A short blog post or Loom walkthrough for each flagship project
- Free-tier hosting: Vercel/Netlify (frontend), Render/Railway/Fly.io (backend), Neon/Supabase (Postgres), Upstash (Redis)

---

## D. Idea Vault (storing ideas you send)
When plan mode is off, every idea you send gets saved in two places:
1. **Project memory**: `C:\Users\Yanish Gurung\.claude\projects\C--portfolio11\memory\portfolio-idea-vault.md`, indexed in `MEMORY.md`, so I remember it in future sessions.
2. **A readable file in the project**: `C:\portfolio11\IDEAS.md`, one entry per idea: *name · source link · what it proves · stack · difficulty · status (idea/planned/building/shipped)*.

(I can't write these files yet: plan mode only lets me edit this plan file.)

## ✅ UPDATED DIRECTION: walkable 3D world + AI robot companion
The user loved Bruno Simon's 3D world portfolio but found the car controls hard for non-gamers. New concept: an **original** walkable world, with our own art, layout and theme, not a copy of his site.

**Core ideas:**
- **Visitor picks the avatar (decided).** When the visitor arrives, they choose from 3–4 neutral characters: a clay figure, an astronaut, an animal and a robot. All are genderless and use one shared animation rig, so a single set of walk, idle and wave animations works for every character. Their choice is remembered.
- **Controls anyone can use:**
  - **Click or tap the ground to walk there**, with pathfinding around obstacles. This is the main control.
  - An on-screen joystick on phones.
  - WASD/arrow keys for gamers.
  - A **"Take the tour" button**: the robot walks the visitor through everything automatically.
- **AI robot companion.** A small floating robot with a glowing screen face (the Neural Core idea, shrunk down) that follows the visitor everywhere.
  - Its idle animations are bobbing, looking at what you hover over, and waving.
  - Chat input at the bottom of the screen, with replies in a speech bubble above the robot and optional voice.
  - The AI can take actions:
    - `walkTo(project)`: "Follow me!" and it leads you there
    - `openProject(id)`
    - `showResume()`
    - `startTour()`
- **World layout (zones):**
  - Spawn plaza with a welcome
  - **Project Hall (all projects in ONE place)**: one big gallery building. Inside, every project has its own glowing display stand with a big screen playing its live demo, and buttons for GitHub, the case study and the live site. Walk from stand to stand, or ask the robot "take me to project X."
  - **Education Zone (new)**: a campus-style area with a small school/university building.
    - Walk in to see your degree, school, years and grades
    - Certificates hang on the wall as frames you can click
    - Courses and bootcamps sit on a bookshelf, and clicking a book shows what you learned
    - The robot can answer "Where did Yanish study?" and walk the visitor here
  - A skills lab or garden
  - A timeline path showing your work experience
  - A contact mailbox
  - A kiosk that opens Recruiter mode

**Characters made in Blender, more realistic (user request):**
- **Style:** "stylized-realistic", like Pixar or Fortnite characters: realistic materials (skin or clay shading, fabric, metal, glass visor) and soft lighting, but simplified shapes. Fully photoreal characters would be too heavy for a website and run badly on phones.
- **4 genderless characters:** a clay figure, an astronaut, an animal and a robot. The **robot buddy** is made in Blender too.
- **Blender pipeline:**
  1. Sculpt the basic shape → simplify it to about 10–20k triangles so it runs fast in a browser
  2. Prepare it for texturing → paint realistic textures (colour, roughness, metal, surface bumps, shadows in creases) in Blender or Substance
  3. Add a skeleton (Rigify, or Mixamo's automatic rigging). **All 4 characters share one skeleton**, so one set of animations works for all of them.
  4. Animations: idle, walk, run, wave, point, sit (Mixamo, then cleaned up in Blender) + robot hover/talk animations
  5. Export as glTF (.glb) → shrink with gltf-transform (Draco for the models, KTX2 for the textures) → **target under 2–3 MB per character**
- **Character picker screen:** each character stands on a slowly rotating stand under studio lighting. Hovering plays its wave animation, and "Choose" plays a short entrance into the world.
- **Realism inside the website:**
  - Realistic materials (PBR) lit by an environment map (HDRI)
  - Soft shadows and ambient occlusion
  - Light bloom and colour grading
  - Footstep sounds
  - Dust or particles when walking
- **Performance:** load only the chosen character in full detail, show low-detail versions in the picker first, and use simpler versions further from the camera (LODs).

**Recruiter Mode = fast but still cool (user request):**
No heavy 3D, but full of smooth scrolling animations. Reached from the loading screen, the kiosk, or by asking the robot.
- **Hero:** your name revealed letter by letter (GSAP SplitText) over a light animated gradient or particle background drawn on a plain 2D canvas, plus Resume / Email / GitHub buttons that pull slightly toward the cursor ("magnetic" buttons).
- **Smooth scroll** with Lenis. Each section **animates in as it reaches the screen** (GSAP ScrollTrigger): fade-up, slide and stagger effects.
- **Projects:** a **horizontal-scroll gallery** that stays in place while you scroll down. Cards tilt in 3D on hover, and the demo video plays on hover.
- **Skills:** icons fly in and arrange themselves into a grid. Progress rings or bars fill up as you scroll.
- **Education + Experience:** a vertical timeline whose line **draws itself as you scroll**, with each milestone popping in.
- **Robot mini-chat:** a small 2D version of the robot in the corner, with the same AI chat.
- **Footer:** "Back to 3D world" button, contact form.
- **Rules:**
  - The page is usable within 2 seconds
  - All animations are skipped when the visitor's device asks for reduced motion
  - Lighthouse score 95+ for performance
  - Same content source as the 3D world, so nothing gets out of sync

**Tech:**
- React Three Fiber + drei, @react-three/rapier (physics and character controller)
- recast-navigation-js (click-to-walk pathfinding)
- Blender models + Mixamo walk, idle and wave animations on a neutral rig, using GLTF + Draco
- GSAP + Zustand
- Vercel AI SDK with tool calls → game actions, answers from your resume and projects via pgvector
- drei `<Html>` for the speech bubbles

**Phases:**
1. Basic world: ground, lighting, follow camera, avatar walking via click-to-move
2. Robot companion: follows the visitor, idle animations, chat UI, streaming answers
3. AI tool calls that drive the world (`walkTo`, `startTour`)
4. Blender characters (model → texture → rig → animate → export .glb) + avatar picker screen + Project Hall (all projects in one building) + Education Zone
5. Remaining zones, sound, a polished loading screen
6. Recruiter Mode with scroll animations (GSAP ScrollTrigger + Lenis + SplitText)
7. Mobile joystick, an automatic lower-quality mode, reduced-motion fallback

**Verification:**
- A non-gamer friend reaches every project with only clicks in under 2 minutes
- 60fps on desktop, 30fps+ on phones
- The robot answers 10 recruiter questions correctly and walks to the right shop each time

---

## (Previous) Neural Core + Request City — build roadmap
**Stack:**
- Next.js 15 (App Router, TypeScript)
- React Three Fiber + drei + postprocessing (bloom), custom GLSL shaders
- GSAP + Lenis, Theatre.js camera paths, Zustand for state
- Vercel AI SDK streaming chat + Postgres/pgvector (Neon free tier) for answers from your resume and projects
- Deploy on Vercel

**Phases:**
1. **Foundation.** Next.js app with Tailwind, a loading screen showing load progress, Lenis smooth scroll, and a Recruiter-mode route (`/cv`, plain 2D).
2. **Neural Core hero.** A GPU particle orb (an FBO/curl-noise shader) with three states: idle, thinking and speaking. It follows the cursor and has bloom.
3. **AI chat.** A chat input over the orb. Answers stream in and the orb reacts to them. Answers come from your resume and projects, with linked sources. The AI can trigger "tool calls" like `flyTo('bookeasy')` that move the 3D camera.
4. **Request City.** A low-poly isometric city (Blender → GLB, compressed with Draco). One building per project, plus instanced light packets moving along spline roads. Hovering shows tooltips, clicking opens a panel about that project.
5. **Transitions.** The camera pulls back from the Core into the City (Theatre.js / GSAP timeline), with SplitText headlines and sound effects you can toggle.
6. **Performance & accessibility.**
   - Lazy-load the 3D, and use `PerformanceMonitor` to drop quality on weak GPUs
   - A simpler scene on mobile
   - `prefers-reduced-motion` fallback
   - Recruiter mode always visible
7. **Content.** Case studies for the 3 flagship projects and live numbers from them.

**Verification:**
- Lighthouse 85+ on desktop, Recruiter mode 95+
- 60fps on a mid-range laptop, 30fps+ on phones
- The AI answers 10 test recruiter questions correctly, with sources
- `flyTo` works for every project

## E. Next steps once you pick
1. Choose a site concept from A and 3 flagships from B
2. For each flagship: MVP scope (MoSCoW, i.e. must/should/could/won't), data model, API design, deployment plan
3. Build in order: portfolio site → flagship 1 → 2 → 3, deploying each as you go

## Verification
- Each project is live, has a demo login, a public repo, CI passing, and a case study published on the portfolio
- Test with a friend: they find your best project and its live demo in under 30 seconds
