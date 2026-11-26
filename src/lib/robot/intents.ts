// Intent definitions: weighted keywords and phrases. Pure data, easy to extend.
//
// Weights: 3-5 = a strong signal on its own, 2 = medium, 1 = weak hint.
// Keywords are matched against content tokens (stopwords removed), with fuzzy matching for
// words of 4+ letters. Never put a stopword in `keywords`: use `phrases` for those.
// Phrases are matched against the whole normalised message (slang already expanded).

import type { IntentId } from "./types";

export interface IntentDef {
  id: IntentId;
  keywords: Record<string, number>;
  phrases: Record<string, number>;
}

export const INTENTS: IntentDef[] = [
  {
    id: "greeting",
    keywords: {
      hi: 3, hello: 3, hey: 3, yo: 2, sup: 2, hola: 3, namaste: 3, greetings: 3, howdy: 3,
      morning: 1, afternoon: 1, evening: 1,
    },
    phrases: {
      "good morning": 3, "good afternoon": 3, "good evening": 3, "what is up": 3, "how are you": 3,
    },
  },
  {
    id: "who_are_you",
    keywords: { robot: 2, bot: 2, chatbot: 3, buddy: 1, assistant: 2, ai: 1 },
    phrases: {
      "who are you": 4, "what are you": 4, "your name": 3, "what is your name": 4,
      "are you a robot": 4, "are you real": 3, "are you ai": 4, "are you human": 4, "are you a bot": 4,
      "about yourself": 4, "introduce yourself": 4, "who is this": 2, "who am i talking to": 4,
    },
  },
  {
    id: "about_owner",
    keywords: { owner: 3, developer: 2, creator: 2, maker: 2, bio: 3, background: 2, intro: 1, introduce: 2, biography: 3 },
    phrases: {
      "who made": 3, "who built": 3, "who created": 3, "who is he": 3, "who is she": 3, "who is they": 3,
      "who is the": 2, "tell me about him": 3, "tell me about her": 3, "tell me about them": 3,
      "about the developer": 3, "about the owner": 3,
    },
  },
  {
    id: "projects_overview",
    keywords: {
      project: 3, projects: 3, portfolio: 1, work: 1, built: 1, build: 1, apps: 2, app: 1,
      websites: 2, showcase: 2, demos: 1, demo: 1, creations: 2,
    },
    phrases: {
      "what have you built": 4, "what did you build": 4, "show me your work": 3, "your work": 2,
      "things you built": 3, "case study": 2, "what do you make": 3, "what you made": 3,
    },
  },
  {
    id: "skills_overview",
    keywords: {
      skills: 4, skill: 3, tech: 2, technologies: 3, technology: 3, tools: 2, languages: 2, frameworks: 2,
      strengths: 2, strength: 2, expertise: 3, frontend: 2, backend: 2, database: 2, databases: 2, devops: 2,
      stack: 2, proficient: 2, abilities: 2,
    },
    phrases: { "tech stack": 4, "good at": 3, "best at": 3, "what languages": 3, "full stack": 1 },
  },
  {
    id: "education",
    keywords: {
      education: 4, school: 3, university: 3, college: 3, degree: 3, study: 2, studied: 3, studies: 2,
      graduated: 3, graduate: 2, qualification: 3, qualifications: 3, academic: 2, gpa: 2, grade: 2,
      diploma: 3, bachelor: 3, bachelors: 3, major: 2, campus: 2,
    },
    phrases: { "where did you study": 4, "where did you go to school": 4, "what did you study": 4 },
  },
  {
    id: "certificates",
    keywords: {
      certificate: 4, certificates: 4, certification: 4, certifications: 4, certified: 3,
      credential: 3, credentials: 3, badge: 1, badges: 1,
    },
    phrases: {},
  },
  {
    id: "courses",
    keywords: {
      course: 4, courses: 4, training: 3, bootcamp: 3, learned: 2, learning: 2, learn: 2, classes: 2, class: 1,
      lessons: 2, tutorial: 2, tutorials: 2,
    },
    phrases: { "online courses": 3 },
  },
  {
    id: "experience",
    keywords: {
      experience: 4, job: 3, jobs: 3, employment: 3, employer: 3, career: 3, company: 2, companies: 2,
      worked: 3, working: 1, role: 2, roles: 2, intern: 3, internship: 3, professional: 2, work: 1, position: 2,
    },
    phrases: { "work history": 4, "years of experience": 4, "where do you work": 4, "where have you worked": 4 },
  },
  {
    id: "contact",
    keywords: {
      contact: 4, email: 4, mail: 3, reach: 3, message: 2, linkedin: 3, github: 3, socials: 3, social: 3,
      phone: 3, call: 2, touch: 3, address: 2,
    },
    phrases: { "get in touch": 4, "how can i reach": 4, "where can i find you": 3 },
  },
  {
    id: "resume",
    keywords: { resume: 5, download: 2, pdf: 2, curriculum: 2, vitae: 2 },
    phrases: { "curriculum vitae": 5 },
  },
  {
    id: "hire_availability",
    keywords: {
      hire: 4, hiring: 4, hired: 4, available: 3, availability: 4, freelance: 3, freelancer: 3, opportunity: 3,
      opportunities: 3, collaborate: 2, collaboration: 2, salary: 3, vacancy: 3, recruit: 2, offer: 1,
    },
    phrases: {
      "open to work": 4, "for hire": 4, "work together": 3, "are you available": 4, "job offer": 3, "looking for work": 3,
    },
  },
  {
    id: "location",
    keywords: {
      location: 4, located: 4, live: 2, lives: 2, based: 3, city: 3, country: 3, timezone: 3, remote: 2, relocate: 3, relocation: 3,
    },
    phrases: { "where are you from": 4, "where do you live": 4, "time zone": 3, "where are you based": 4 },
  },
  {
    id: "tour",
    keywords: { tour: 5, explore: 3, around: 1, wander: 2, sightseeing: 3 },
    phrases: {
      "show me around": 5, "look around": 4, "walk me through": 4, "guide me": 3, "take me around": 5,
      "give me a tour": 5, "start the tour": 5, "show me everything": 4,
    },
  },
  {
    id: "navigate",
    keywords: { navigate: 3, teleport: 3 },
    phrases: { "take me": 2, "go to": 2, "bring me": 2, "walk me": 2, "lead me": 2, "where is": 1 },
  },
  {
    id: "recruiter_mode",
    keywords: { recruiter: 3, hurry: 4, quick: 2, quickly: 2, fast: 2, tldr: 4, skip: 2, speedy: 2, summary: 2, brief: 2 },
    phrases: {
      "in a hurry": 5, "no time": 4, "recruiter mode": 5, "plain version": 3, "simple version": 3,
      "i am a recruiter": 4, "quick version": 4, "short version": 4, "just the facts": 4,
    },
  },
  {
    id: "goodbye",
    keywords: { bye: 5, goodbye: 5, farewell: 4, goodnight: 4, leaving: 3, later: 1.5, cya: 4 },
    phrases: { "see you": 4, "good night": 4, "gotta go": 4, "got to go": 4, "talk later": 3, "have a good day": 3 },
  },
  {
    id: "thanks",
    keywords: { thanks: 5, thank: 5, appreciated: 3, cheers: 3, awesome: 1.5, great: 1.5, cool: 1.5, nice: 1.5, perfect: 1.5, brilliant: 1.5 },
    phrases: { "thank you": 5, "got it": 2 },
  },
  {
    id: "joke",
    keywords: { joke: 5, jokes: 5, funny: 4, fun: 2, laugh: 3, humor: 3, humour: 3, bored: 2, riddle: 2, pun: 3, puns: 3 },
    phrases: { "make me laugh": 5, "cheer me up": 4, "something fun": 3 },
  },
  {
    id: "help",
    keywords: { help: 4, commands: 3, options: 3, menu: 3, instructions: 3, confused: 2, lost: 2, assist: 2, features: 2 },
    phrases: {
      "what can you do": 6, "what do you do": 3, "how do i": 2, "how does this work": 4, "what can i ask": 5,
      "what should i ask": 5, "what can i do": 5,
    },
  },
];

/**
 * Ambiguous aliases ("go", "next", "c"...) only count as a skill with an exact match
 * plus one of these cues somewhere in the message.
 */
export const AMBIGUOUS_CUES: ReadonlySet<string> = new Set([
  "know", "knew", "use", "used", "using", "uses", "experience", "experienced", "skill", "skilled", "familiar",
  "proficient", "comfortable", "expert", "expertise", "code", "coding", "program", "programming", "learn", "fluent",
  "language", "framework", "library", "write", "written",
]);

export const AMBIGUOUS_ALIASES: ReadonlySet<string> = new Set([
  "go", "next", "c", "r", "rest", "express", "swift", "spring", "rust",
]);

/** Common technologies that may NOT be on the owner's list. Used to answer "no, not listed" honestly. */
export const TECH_VOCAB: string[] = [
  "Python", "Java", "JavaScript", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "C", "C++", "C#", "Angular", "Vue",
  "Svelte", "Django", "Flask", "Spring", "Laravel", "Rails", "Express", "MySQL", "SQLite", "SQL", "AWS", "Azure", "GCP",
  "Kubernetes", "Terraform", "GraphQL", "Firebase", "Flutter", "Unity", "Unreal", "Figma", "Photoshop", "Excel", "Redis",
  "Supabase", "Prisma", "Jest", "Linux",
];

/** Tech names that mean the same thing. First entry is the canonical key. Generic tech knowledge, not owner facts. */
export const SYNONYM_GROUPS: string[][] = [
  ["postgresql", "postgres", "psql", "postgre", "sql"],
  ["mongodb", "mongo"],
  ["nodejs", "node"],
  ["nextjs", "next"],
  ["threejs", "3js", "three js"],
  ["typescript", "ts"],
  ["javascript", "js", "ecmascript"],
  ["cicd", "ci cd", "continuous integration"],
  ["llm apis", "llm api", "llm", "llms", "openai", "gpt"],
  ["tailwind css", "tailwind", "tailwindcss"],
  ["rest apis", "rest api", "restful", "rest"],
  ["authentication", "auth", "oauth"],
  ["react", "reactjs"],
  ["websockets", "websocket", "socketio", "socket io"],
];

/** Words to ignore when making a short alias out of an entity name ("Placeholder University" → "placeholder"). */
export const GENERIC_NAME_WORDS: ReadonlySet<string> = new Set([
  "university", "college", "school", "institute", "academy", "of", "the", "and", "company", "inc", "ltd", "llc",
  "corp", "co", "technologies", "labs", "solutions", "course", "certificate", "certified", "professional",
  "css", "js", "api", "apis", "app",
]);
