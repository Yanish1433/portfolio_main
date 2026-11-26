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
//   featured     true on exactly ONE project: your flagship. It gets the big central stand.
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
  /** The flagship project (set on one only). */
  featured?: boolean;
  /** The plain-word layers, in order, e.g. Website -> Server -> Database. */
  architecture?: { label: string; tech: string }[];
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
  title: "Full-Stack Developer",
  tagline: "I build fast, useful web products from idea to deployment.",
  summary:
    "Full-stack developer focused on React, Next.js and Node.js, with a growing interest in 3D web experiences and applied AI. Placeholder summary: replace with the real one.",
  location: "Placeholder City, Country",
  links: {
    github: "#",
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
        { name: "Authentication", level: 75, years: 2, usedIn: ["bookeasy"] },
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
        { name: "Three.js", level: 60, years: 1 },
        { name: "Blender", level: 50, years: 1 },
        { name: "LLM APIs", level: 65, years: 1 },
      ],
    },
  ],
  projects: [
    {
      id: "bookeasy",
      name: "BookEasy",
      tagline: "Booking SaaS for small service businesses",
      description:
        "Multi-tenant booking platform with calendars, reminders and online payments.",
      problem:
        "Small service businesses lose bookings to phone tag and double-booked slots.",
      stack: ["Next.js", "TypeScript", "PostgreSQL", "Stripe"],
      highlights: [
        "Multi-tenant data isolation",
        "Real-time availability checks",
        "Automated email reminders",
      ],
      liveUrl: "#",
      repoUrl: "#",
      caseStudyUrl: "#",
      demoVideo: null,
      year: 2025,
      // Showcase fields (placeholder: replace with real text and numbers)
      pitch: "Helps salons and clinics take bookings online (placeholder).",
      audience: "Small service businesses and their customers (placeholder).",
      featured: true,
      architecture: [
        { label: "Website", tech: "Next.js" },
        { label: "Server", tech: "Node API" },
        { label: "Database", tech: "PostgreSQL" },
        { label: "Payments", tech: "Stripe" },
      ],
      metrics: [
        { label: "Businesses", value: "40", plain: "small businesses take bookings with it (placeholder)" },
        { label: "Bookings", value: "1.2k", plain: "appointments booked every month (placeholder)" },
        { label: "No-shows", value: "-30%", plain: "fewer missed appointments thanks to reminders (placeholder)" },
      ],
    },
    {
      id: "syncboard",
      name: "SyncBoard",
      tagline: "Real-time collaborative whiteboard",
      description:
        "Shared canvas where multiple users draw, add sticky notes and see each other's cursors live.",
      problem:
        "Remote teams need a lightweight whiteboard that stays in sync without lag.",
      stack: ["React", "WebSockets", "Node.js", "Redis"],
      highlights: [
        "Conflict-free shared state",
        "Live cursors with presence",
        "Undo/redo across sessions",
      ],
      liveUrl: "#",
      repoUrl: "#",
      caseStudyUrl: null,
      demoVideo: null,
      year: 2024,
      // Showcase fields (placeholder: replace with real text and numbers)
      pitch: "A shared online whiteboard where a team draws together, live (placeholder).",
      audience: "Remote teams and classrooms (placeholder).",
      architecture: [
        { label: "Website", tech: "React" },
        { label: "Live link", tech: "WebSockets" },
        { label: "Server", tech: "Node.js" },
        { label: "Memory", tech: "Redis" },
      ],
      metrics: [
        { label: "Live users", value: "50", plain: "people can draw on one board at once (placeholder)" },
        { label: "Delay", value: "<100 ms", plain: "a stroke shows up for everyone almost instantly (placeholder)" },
      ],
    },
    {
      id: "repoguide",
      name: "RepoGuide",
      tagline: "AI codebase explainer",
      description:
        "Point it at a repository and get a guided tour of architecture, modules and key flows.",
      problem:
        "Onboarding onto an unfamiliar codebase takes days of reading without a map.",
      stack: ["Next.js", "LLM API", "Tree-sitter", "Postgres"],
      highlights: [
        "Chunked repo indexing",
        "Answers grounded in file references",
        "Generated architecture overviews",
      ],
      liveUrl: null,
      repoUrl: "#",
      caseStudyUrl: null,
      demoVideo: null,
      year: 2025,
      // Showcase fields (placeholder: replace with real text and numbers)
      pitch: "Explains an unfamiliar codebase to you like a guide on a tour (placeholder).",
      audience: "New developers joining a team (placeholder).",
      architecture: [
        { label: "Website", tech: "Next.js" },
        { label: "Code reader", tech: "Tree-sitter" },
        { label: "AI helper", tech: "LLM API" },
        { label: "Database", tech: "Postgres" },
      ],
      metrics: [
        { label: "Repos", value: "25", plain: "projects explained so far (placeholder)" },
        { label: "Onboarding", value: "days to hours", plain: "time to understand a new codebase (placeholder)" },
      ],
    },
  ],
  education: [
    {
      id: "uni",
      school: "Placeholder University",
      degree: "Bachelor of Science",
      field: "Computer Science",
      start: "2021",
      end: "2025",
      grade: "Placeholder grade",
      highlights: ["Placeholder highlight: relevant coursework", "Placeholder highlight: final project"],
    },
    {
      id: "college",
      school: "Placeholder College",
      degree: "Diploma",
      field: "Software Engineering",
      start: "2019",
      end: "2021",
      grade: "Placeholder grade",
      highlights: ["Placeholder highlight: first web project"],
    },
  ],
  certificates: [
    {
      id: "cert-1",
      name: "Placeholder Certificate One",
      issuer: "Placeholder Issuer",
      year: 2025,
      url: "#",
    },
    {
      id: "cert-2",
      name: "Placeholder Certificate Two",
      issuer: "Placeholder Issuer",
      year: 2024,
      url: "#",
    },
    {
      id: "cert-3",
      name: "Placeholder Certificate Three",
      issuer: "Placeholder Issuer",
      year: 2024,
      url: "#",
    },
  ],
  courses: [
    {
      id: "course-1",
      name: "Placeholder Course: Full-Stack Web Development",
      provider: "Placeholder Provider",
      learned: ["Placeholder skill A", "Placeholder skill B"],
    },
    {
      id: "course-2",
      name: "Placeholder Course: Cloud and DevOps",
      provider: "Placeholder Provider",
      learned: ["Placeholder skill C", "Placeholder skill D"],
    },
    {
      id: "course-3",
      name: "Placeholder Course: Applied Machine Learning",
      provider: "Placeholder Provider",
      learned: ["Placeholder skill E"],
    },
  ],
  experience: [
    {
      id: "exp-1",
      role: "Full-Stack Developer",
      company: "Placeholder Company A",
      start: "2025",
      end: "Present",
      points: ["Placeholder: shipped a customer-facing feature", "Placeholder: improved page load time"],
      impact: "Placeholder: made the main page twice as fast for customers.",
    },
    {
      id: "exp-2",
      role: "Junior Web Developer",
      company: "Placeholder Company B",
      start: "2023",
      end: "2025",
      points: ["Placeholder: built internal tools", "Placeholder: wrote automated tests"],
      impact: "Placeholder: saved the team hours every week with internal tools.",
    },
  ],
  // Placeholder "About me": replace with the real story, photo and buttons.
  about: {
    story: [
      "Placeholder: I grew up curious about how websites work, and started building small ones for friends.",
      "Placeholder: Today I build full-stack products from the first sketch to the live site.",
      "Placeholder: I like work where clear design and solid engineering meet.",
    ],
    loves: [
      "Placeholder: tools that save people time",
      "Placeholder: fast, friendly interfaces",
      "Placeholder: playful 3D on the web",
    ],
    funFacts: ["Placeholder: I drink too much tea.", "Placeholder: I built this whole town as my portfolio."],
    cta: [
      { label: "Hire me", href: "#" },
      { label: "Download resume", href: "#" },
      { label: "Contact", href: "#" },
    ],
  },
};
