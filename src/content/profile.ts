// PLACEHOLDER CONTENT — captain will replace with real data.
// Every site section reads from this one file.
//
// ─────────────────────────────────────────────────────────────────────────────
// HOW TO FILL THE NEW "SHOWCASE" FIELDS (all optional: leave out what you don't have)
// ─────────────────────────────────────────────────────────────────────────────
// Write for someone who has never written code. Plain words first; tech names second.
//
// PROJECTS (each entry in `projects`)
//   pitch        One plain sentence, no jargon.   "Helps salons take bookings online."
//   audience     Who it helps.                    "Small salons and clinics."
//   featured     true on one or two projects: your flagships. Each gets a big stand; every visitor
//                sees one of them as the "lead" (picked once per browser session).
//   disclaimer   Optional honesty line, e.g. "Concept project, not affiliated with X."
//   architecture The parts of the system, in order, left to right. `label` is the plain word
//                (Website, Server, Database, Payments...). `tech` is the real tool's name.
//                [{ label: "Website", tech: "Next.js" }, { label: "Server", tech: "Node API" },
//                 { label: "Database", tech: "PostgreSQL" }]
//                Skip it and the site makes a guess from `stack`.
//   metrics      Real numbers, 2-3 is plenty. `value` is the big number, `label` the name, and
//                `plain` explains it in words.     { label: "Users", value: "1.2k", plain: "people use it every month" }
//   media        Pictures and video of the project (see "WHERE THE FILES GO" below):
//                  poster      one hero image, e.g. "/showcase/bookeasy/poster.webp"
//                  screenshots a list, e.g. ["/showcase/bookeasy/shot-1.webp", "/showcase/bookeasy/shot-2.webp"]
//                  video       a short muted demo, e.g. "/showcase/bookeasy/demo.mp4"
//                Only list files that really exist, or leave `media` out. Without it the site
//                falls back to  poster.webp in the project's folder -> public/projects/<id>.webp -> a
//                generated poster.
//
// SKILLS (each entry in a skill group)
//   years        How many years you have used it, e.g. 2.
//   usedIn       Project ids that used it, e.g. ["bookeasy", "syncboard"]. Leave it out and the
//                site works it out from each project's `stack`.
//
// EXPERIENCE (each entry in `experience`)
//   impact       One plain line about what changed because of you:
//                "Cut the checkout page load time in half."
//
// ABOUT YOU (`about`, near the bottom)
//   photo        "/showcase/about/photo.webp"
//   story        3-4 short paragraphs or sentences about you.
//   loves        "What I love building": short phrases.
//   funFacts     Optional light facts.
//   cta          Buttons at the end, e.g. [{ label: "Hire me", href: "mailto:you@example.com" },
//                { label: "Download resume", href: "/resume.pdf" }]
//
// WHERE THE FILES GO  (everything is under public/ and is served from "/")
//   public/showcase/<project-id>/poster.webp   hero image (under ~150 KB)
//   public/showcase/<project-id>/shot-1.webp   screenshots: shot-1, shot-2, shot-3 ...
//   public/showcase/<project-id>/demo.mp4      short muted clip (under ~1.5 MB)
//   public/showcase/about/photo.webp           your photo
// <project-id> is the `id` of the project below ("bookeasy", "syncboard"...).
// More detail: public/showcase/README.md.
//
// Placeholder values added for the showcase are marked "(placeholder)" or have placeholder numbers:
// replace them with real ones. Helpers that read this data live in src/content/showcase.ts.

export type SkillCategory = "frontend" | "backend" | "database" | "devops" | "3d/ai";

export type Skill = {
  name: string;
  /** Self-rated proficiency, 0–100. */
  level: number;
  /** Years of experience with it. */
  years?: number;
  /** Ids of the projects that used it. If absent, it is derived from each project's `stack`. */
  usedIn?: string[];
};

export type SkillGroup = {
  category: SkillCategory;
  label: string;
  skills: Skill[];
};

export type ProfileLinks = {
  github: string;
  linkedin: string;
  email: string;
  resumeUrl: string;
};

export type Project = {
  id: string;
  name: string;
  tagline: string;
  description: string;
  problem: string;
  stack: string[];
  highlights: string[];
  liveUrl: string | null;
  repoUrl: string | null;
  caseStudyUrl: string | null;
  demoVideo: string | null;
  year: number;
  /** One plain-language line for non-technical visitors ("Helps salons take bookings online"). */
  pitch?: string;
  /** Who it helps. */
  audience?: string;
  /** A flagship project (set on one or two). Each visitor sees one of them as the lead. */
  featured?: boolean;
  /** The plain-word layers, in order, e.g. Website -> Server -> Database. */
  architecture?: { label: string; tech: string }[];
  /** A short honesty line shown wherever the project is shown (e.g. "Concept project, not affiliated with X."). */
  disclaimer?: string;
  /** Real numbers: `value` is the big figure, `plain` says what it means in words. */
  metrics?: { label: string; value: string; plain?: string }[];
  /** Files under /showcase/<id>/ (see public/showcase/README.md). */
  media?: { poster?: string; screenshots?: string[]; video?: string };
};

export type Education = {
  id: string;
  school: string;
  degree: string;
  field: string;
  start: string;
  end: string;
  grade: string;
  highlights: string[];
};

export type Certificate = {
  id: string;
  name: string;
  issuer: string;
  year: number;
  url: string;
};

export type Course = {
  id: string;
  name: string;
  provider: string;
  learned: string[];
};

export type Experience = {
  id: string;
  role: string;
  company: string;
  start: string;
  end: string;
  points: string[];
  /** One plain-language line about what changed because of this role. */
  impact?: string;
};

export type About = {
  photo?: string;
  /** Short paragraphs: the story in plain words. */
  story: string[];
  /** "What I love building". */
  loves: string[];
  funFacts?: string[];
  /** Buttons such as "Hire me" or "Download resume". */
  cta?: { label: string; href: string }[];
};

export type Profile = {
  name: string;
  title: string;
  tagline: string;
  summary: string;
  location: string;
  links: ProfileLinks;
  skills: SkillGroup[];
  projects: Project[];
  education: Education[];
  certificates: Certificate[];
  courses: Course[];
  experience: Experience[];
  about?: About;
};

export const profile: Profile = {
  name: "Yanish Gurung",
  title: "Full-Stack Developer · BIT Graduate",
  tagline: "I build fast, useful web products from idea to deployment.",
  summary:
    "Bachelor of Information Technology (BIT) graduate from Lincoln University with a strong passion for full-stack web development: intuitive, responsive interfaces and dependable backend applications.",
  location: "Placeholder City, Country",
  links: {
    github: "https://github.com/Yanish1433",
    linkedin: "#",
    email: "#",
    resumeUrl: "#",
  },
  skills: [
    {
      category: "frontend",
      label: "Frontend",
      skills: [
        { name: "React", level: 85, years: 3 },
        { name: "Next.js", level: 80, years: 2 },
        { name: "TypeScript", level: 82, years: 3 },
        { name: "Tailwind CSS", level: 85, years: 3 },
      ],
    },
    {
      category: "backend",
      label: "Backend",
      skills: [
        { name: "Node.js", level: 80, years: 3 },
        { name: "REST APIs", level: 80, years: 3 },
        { name: "Authentication", level: 75, years: 2, usedIn: ["barber-on-demand", "goldstar-3d"] },
      ],
    },
    {
      category: "database",
      label: "Database",
      skills: [
        { name: "PostgreSQL", level: 75, years: 2 },
        { name: "MongoDB", level: 70, years: 2 },
      ],
    },
    {
      category: "devops",
      label: "DevOps",
      skills: [
        { name: "Git", level: 85, years: 4 },
        { name: "Docker", level: 65, years: 1 },
        { name: "CI/CD", level: 60, years: 1 },
      ],
    },
    {
      category: "3d/ai",
      label: "3D & AI",
      skills: [
        { name: "Three.js", level: 60, years: 1, usedIn: ["barber-on-demand", "goldstar-3d"] } /* Barber uses React Three Fiber, which is three.js */,
        { name: "Blender", level: 50, years: 1 },
        { name: "LLM APIs", level: 65, years: 1 },
      ],
    },
  ],
  projects: [
    {
      id: "barber-on-demand",
      name: "Barber On Demand",
      tagline: "At-home barber booking with live tracking",
      description:
        "Pick a service and a barber, choose a time, pin your home on the map and confirm. You can watch your barber travel to you live, and pay with eSewa, Khalti, Fonepay or cash (demo checkout).",
      problem:
        "Going to a salon means queues, uneven hygiene and a trip across town, which is hard for busy or elderly people.",
      stack: [
        "React",
        "Vite",
        "Tailwind CSS",
        "React Three Fiber",
        "GSAP",
        "Lenis",
        "Framer Motion",
        "Leaflet",
        "Node.js",
        "Express",
        "MongoDB",
        "Mongoose",
        "WebSockets",
        "Zod",
        "JWT",
        "Cloudflare Workers",
      ],
      highlights: [
        "Live barber tracking on a real Kathmandu route (WebSockets)",
        "Demo checkout for eSewa, Khalti, Fonepay and cash",
        "Cinematic 3D hero with scroll animation",
        "Runs on Cloudflare Workers + Durable Objects, with a cron job for reminders",
      ],
      liveUrl: "https://barber-on-demand.barber-on-demand.workers.dev/",
      repoUrl: "https://github.com/Yanish1433/barbers",
      caseStudyUrl: null,
      demoVideo: null,
      year: 2026,
      pitch: "Book a premium barber who comes to your home, anywhere in Kathmandu.",
      audience: "Busy professionals, elderly people and families in the Kathmandu Valley.",
      featured: true,
      media: {
        poster: "/showcase/barber-on-demand/poster.webp",
        screenshots: [
          "/showcase/barber-on-demand/shot-1.webp",
          "/showcase/barber-on-demand/shot-2.webp",
          "/showcase/barber-on-demand/shot-3.webp",
          "/showcase/barber-on-demand/shot-4.webp",
        ],
        video: "/showcase/barber-on-demand/demo.mp4",
      },
      architecture: [
        { label: "Website", tech: "React + Vite" },
        { label: "Server", tech: "Express on Cloudflare Workers" },
        { label: "Live updates", tech: "WebSockets (Durable Object)" },
        { label: "Database", tech: "MongoDB Atlas" },
        { label: "Map", tech: "Leaflet + OSRM" },
      ],
    },
    {
      id: "goldstar-3d",
      name: "Goldstar 3D",
      tagline: "Scroll-driven 3D shoe shop (concept, not affiliated with Goldstar)",
      description:
        "A full shop with catalogue, cart, cash-on-delivery checkout and an admin panel. The G10 trek shoe gets a scroll-driven 3D story. Concept prototype, not an official Goldstar site.",
      problem:
        "Product pages for a beloved local shoe brand feel flat. Shoppers can't see why a shoe is special before buying.",
      stack: [
        "React",
        "Vite",
        "React Three Fiber",
        "Three.js",
        "GSAP",
        "Lenis",
        "Node.js",
        "Express",
        "MongoDB",
        "Mongoose",
        "Zod",
        "JWT",
        "Vitest",
        "Cloudflare Pages",
      ],
      highlights: [
        "Scroll-driven 3D product story (React Three Fiber + GSAP)",
        "Secure login with httpOnly cookie JWT",
        "Admin panel for products and orders",
        "Tested API with a separate test database",
      ],
      liveUrl: "https://goldstar-3d.pages.dev",
      repoUrl: "https://github.com/Yanish1433/Goldstar-project",
      caseStudyUrl: null,
      demoVideo: null,
      year: 2026,
      pitch: "A pitch-ready online shoe shop where scrolling tells a 3D story of the shoe.",
      audience: "Shoe shoppers in Nepal; built as a pitch for the Goldstar brand.",
      featured: true,
      media: {
        poster: "/showcase/goldstar-3d/poster.webp",
        screenshots: [
          "/showcase/goldstar-3d/shot-1.webp",
          "/showcase/goldstar-3d/shot-2.webp",
          "/showcase/goldstar-3d/shot-3.webp",
          "/showcase/goldstar-3d/shot-4.webp",
          "/showcase/goldstar-3d/shot-5.webp",
        ],
        video: "/showcase/goldstar-3d/demo.mp4",
      },
      disclaimer: "Concept project, not affiliated with Goldstar.",
      architecture: [
        { label: "Website", tech: "React + Vite" },
        { label: "Server", tech: "Express 5" },
        { label: "Database", tech: "MongoDB 8" },
      ],
    },
  ],
  education: [
    {
      id: "techskills",
      school: "TechSkills Institute",
      degree: "",
      field: "",
      start: "",
      end: "present",
      grade: "",
      highlights: [],
    },
    {
      id: "bit",
      school: "Lincoln University",
      degree: "Bachelor of Information Technology (BIT)",
      field: "Information Technology",
      start: "2022",
      end: "2026",
      grade: "",
      highlights: [],
    },
    {
      id: "plus-two",
      school: "Capital College and Research Center (CCRC)",
      degree: "Higher Secondary Education (+2)",
      field: "",
      start: "2020",
      end: "2022",
      grade: "",
      highlights: [],
    },
    {
      id: "school",
      school: "Universal School",
      degree: "Secondary Education (up to Class 10)",
      field: "",
      start: "",
      end: "2020",
      grade: "",
      highlights: [],
    },
  ],
  // No real certificates, courses or jobs yet (captain, 2026-11-26): the world and Recruiter Mode
  // show friendly empty states. Add entries here when there are real ones.
  certificates: [],
  courses: [],
  experience: [],
  // About me: written from the captain's resume (2026-11-26).
  about: {
    photo: "/showcase/about/photo.webp",
    story: [
      "I'm a Bachelor of Information Technology (BIT) graduate from Lincoln University with a strong passion for full-stack web development.",
      "I love building intuitive, responsive interfaces and dependable backend applications, from the first sketch to the live site.",
      "I'm looking for an entry-level Full-Stack Developer or Software Engineering role where I can bring fresh ideas, problem-solving and hands-on project experience to a team.",
    ],
    loves: [
      "Full web apps, from the interface to the server",
      "Mobile-first, brand-focused website designs",
      "Clean, well-organised code and quick prototypes",
    ],
    funFacts: ["I built this whole Bhaktapur town as my portfolio."],
    cta: [
      { label: "See my GitHub", href: "https://github.com/Yanish1433" },
      { label: "Hire me", href: "#" },
    ],
  },
};
