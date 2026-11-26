// Every visible string of the Nepal world in one place (English + Nepali).
// Nepali wording is a proposal for the captain to approve; see the report.

export type BiLabel = { en: string; ne: string };

export const LABELS = {
  zones: {
    plaza: { en: "Durbar Square", ne: "दरबार क्षेत्र" },
    "project-hall": { en: "Project Hall", ne: "परियोजना कक्ष" },
    education: { en: "Education", ne: "शिक्षा" },
    "skills-lab": { en: "Skills", ne: "सीप" },
    timeline: { en: "Work Journey", ne: "कार्य अनुभव" },
    about: { en: "Yanish's Ghar", ne: "यानिशको घर" },
    mailbox: { en: "Contact", ne: "सम्पर्क" },
    // Captain's choice (2026-11-26): "quick introduction".
    kiosk: { en: "Recruiter Mode", ne: "छिटो परिचय" },
  } satisfies Record<string, BiLabel>,
  signs: {
    teaStall: { en: "Recruiter Chiya Pasal", ne: "चिया पसल" },
    school: { en: "Pathshala", ne: "पाठशाला" },
    hulak: { en: "Hulak", ne: "हुलाक" },
  } satisfies Record<string, BiLabel>,
  welcome: { title: "Namaste 🙏", ne: "नमस्ते" },
  ui: {
    toDay: "Switch to day",
    toNight: "Switch to night",
    changeCharacter: "Change character",
    dance: "Dance",
    stopTour: "Stop tour",
    resumeSoon: "Resume coming soon",
  },
  picker: { title: "Choose your character", ne: "आफ्नो पात्र छान्नुहोस्" },
  robot: {
    name: "Diyo",
    placeholder: "Ask me anything… / केही सोध्नुहोस्…",
    send: "Send",
    followMe: "Follow me!",
  },
} as const;
