// Test-only fixture: the three placeholder projects the robot tests were written against.
// Kept here (not read from src/content/profile.ts) so editing the real content never breaks them.
import type { Certificate, Course, Education, Experience, Project } from "@/content/profile";

export const FIXTURE_PROJECTS: Project[] = [
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
];

// Filled education/certificates/courses/experience for the "filled profile" tests.
export const FIXTURE_EDUCATION: Education[] = [
  { id: "uni", school: "Placeholder University", degree: "Bachelor of Science", field: "Computer Science", start: "2021", end: "2025", grade: "First class", highlights: ["Final project"] },
  { id: "college", school: "Placeholder College", degree: "Diploma", field: "Software Engineering", start: "2019", end: "2021", grade: "", highlights: [] },
];
export const FIXTURE_CERTIFICATES: Certificate[] = [
  { id: "cert-1", name: "Placeholder Certificate One", issuer: "Placeholder Issuer", year: 2025, url: "#" },
];
export const FIXTURE_COURSES: Course[] = [
  { id: "course-1", name: "Placeholder Course: Web", provider: "Placeholder Provider", learned: ["Skill A"] },
];
export const FIXTURE_EXPERIENCE: Experience[] = [
  { id: "exp-1", role: "Full-Stack Developer", company: "Placeholder Company A", start: "2025", end: "Present", points: ["Shipped a feature"], impact: "Made the main page faster." },
];

// The shape of the captain's real data today: four schools (one current), nothing else.
export const FIXTURE_REAL_EDUCATION: Education[] = [
  { id: "techskills", school: "TechSkills Institute", degree: "", field: "", start: "", end: "present", grade: "", highlights: [] },
  { id: "bit", school: "Lincoln University", degree: "Bachelor of Information Technology (BIT)", field: "Information Technology", start: "2022", end: "2026", grade: "", highlights: [] },
  { id: "plus-two", school: "Capital College and Research Center (CCRC)", degree: "Higher Secondary Education (+2)", field: "", start: "2020", end: "2022", grade: "", highlights: [] },
  { id: "school", school: "Universal School", degree: "Secondary Education (up to Class 10)", field: "", start: "", end: "2020", grade: "", highlights: [] },
];
