import React from 'react'

export type Profile = {
  name: string;
  title: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  github: string;
  website: string;
};

export type ExperienceEntry = {
  id: string;
  title: string;
  company: string;
  location: string;
  period: string;
  bullets: string[];
};

export type EducationEntry = {
  id: string;
  degree: string;
  institution: string;
  location: string;
  period: string;
  details: string;
};

export type ProjectEntry = {
  id: string;
  name: string;
  stack: string;
  url: string;
  description: string;
  bullets: string[];
};

export type SkillGroup = {
  id: string;
  category: string;
  skills: string;
};

export type CertEntry = { id: string; name: string; issuer: string; year: string };
export type LangEntry = { id: string; name: string; level: string };
export type CustomSection = {
  id: string;
  title: string;
  entries: { id: string; heading: string; subheading: string; body: string }[];
};

export type ResumeData = {
  profile: Profile;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  projects: ProjectEntry[];
  skills: SkillGroup[];
  certifications: CertEntry[];
  languages: LangEntry[];
  custom: CustomSection[];
  sectionOrder: string[];
};

export type CoverLetterData = {
  recipientName: string;
  recipientTitle: string;
  company: string;
  companyAddress: string;
  date: string;
  greeting: string;
  body: string;
  closing: string;
  jobDescription: string;
};

export type AppState = {
  resume: ResumeData;
  cover: CoverLetterData;
  theme: "classic" | "modern" | "compact";
  view: "resume" | "cover";
  margins: number;
};

let fallbackUidCounter = 0;

export const uid = () => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replaceAll("-", "").slice(0, 9);
  }

  fallbackUidCounter += 1;
  return `id${Date.now().toString(36)}${fallbackUidCounter.toString(36)}`;
};

const DEFAULT_RESUME: ResumeData = {
  profile: {
    name: "Alex Chen",
    title: "Software Engineer",
    email: "alex.chen@email.com",
    phone: "(555) 123-4567",
    location: "San Francisco, CA",
    linkedin: "linkedin.com/in/alexchen",
    github: "github.com/alexchen",
    website: "alexchen.dev",
  },
  summary:
    "Computer Science senior at UC Berkeley graduating May 2026, with internship experience at two YC-backed startups shipping production TypeScript and Python systems. Comfortable across the full stack — React, Node, Postgres, AWS — and consistently the engineer teammates ask to review their PRs.",
  experience: [
    {
      id: uid(),
      title: "Software Engineering Intern",
      company: "Linear",
      location: "San Francisco, CA",
      period: "Jun 2025 — Aug 2025",
      bullets: [
        "Shipped real-time presence indicators across 4 surfaces of the issue tracker, reducing duplicate edits by 38% (measured via conflict-resolution telemetry).",
        "Authored a TypeScript codemod migrating 220+ components from legacy state hooks to Zustand selectors; merged across 6 PRs with zero regressions.",
        "Led design review for the keyboard-shortcut palette; proposal adopted and shipped to all 80k+ workspace users.",
      ],
    },
    {
      id: uid(),
      title: "Software Engineering Intern",
      company: "Modal Labs",
      location: "Remote",
      period: "Jan 2025 — May 2025",
      bullets: [
        "Built a Python SDK for distributed batch inference jobs; powers $40k+/mo in customer-facing GPU workloads.",
        "Cut cold-start p99 latency from 4.2s → 1.1s by pre-warming container pools tuned per region.",
      ],
    },
    {
      id: uid(),
      title: "Undergraduate Research Assistant",
      company: "Berkeley AI Research (BAIR)",
      location: "Berkeley, CA",
      period: "Sep 2024 — Present",
      bullets: [
        "Co-authoring a workshop paper at NeurIPS 2026 on retrieval-augmented code generation; first-authoring the evaluation harness.",
      ],
    },
  ],
  education: [
    {
      id: uid(),
      degree: "B.S. Computer Science",
      institution: "University of California, Berkeley",
      location: "Berkeley, CA",
      period: "Aug 2022 — May 2026",
      details:
        "GPA 3.87 · Relevant coursework: Operating Systems (CS162), Databases (CS186), Distributed Systems (CS262), Machine Learning (CS189).",
    },
  ],
  projects: [
    {
      id: uid(),
      name: "lex.sh",
      stack: "TypeScript · Bun · SQLite",
      url: "github.com/alexchen/lex",
      description: "",
      bullets: [
        "Open-source CLI that turns shell history into a searchable, replayable log; 1.4k GitHub stars, 30+ contributors.",
        "Built a SQLite FTS5 index over 100k+ command entries with sub-5ms search across the local corpus.",
      ],
    },
    {
      id: uid(),
      name: "Course Compass",
      stack: "Next.js · Postgres · OpenAI",
      url: "coursecompass.app",
      description: "",
      bullets: [
        "Berkeley course planner used by 2,400+ students for Fall 2025 enrollment; ingested 12k+ reviews into a semantic search index.",
      ],
    },
  ],
  skills: [
    { id: uid(), category: "Languages", skills: "TypeScript, Python, Go, Rust, SQL" },
    { id: uid(), category: "Frameworks", skills: "React, Next.js, Node.js, FastAPI, PostgreSQL" },
    { id: uid(), category: "Infrastructure", skills: "AWS (Lambda, ECS, RDS), Docker, Terraform, GitHub Actions" },
    { id: uid(), category: "Tools", skills: "Vim, Linear, Figma, Datadog, Sentry" },
  ],
  certifications: [
    { id: uid(), name: "AWS Certified Cloud Practitioner", issuer: "Amazon Web Services", year: "2024" },
  ],
  languages: [
    { id: uid(), name: "English", level: "Native" },
    { id: uid(), name: "Mandarin", level: "Conversational" },
  ],
  custom: [],
  sectionOrder: [
    "summary",
    "experience",
    "projects",
    "education",
    "skills",
    "certifications",
    "languages",
  ],
};

const DEFAULT_COVER: CoverLetterData = {
  recipientName: "Hiring Manager",
  recipientTitle: "",
  company: "Stripe",
  companyAddress: "510 Townsend Street, San Francisco, CA 94103",
  date: new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }),
  greeting: "Dear Hiring Manager,",
  body:
    "I'm writing to apply for the Software Engineering New Grad role at Stripe. After two summers at developer-tooling startups — Linear and Modal — I'm looking for a team that takes craft, latency, and developer experience as seriously as Stripe does, and the API design culture there is the closest thing I've found to what I want to spend a decade building.\n\nAt Linear I shipped real-time presence across the issue tracker, cutting duplicate edits by 38%; at Modal I owned the batch inference SDK that now powers $40k+/month in customer GPU workloads. Both roles taught me that the highest-leverage work for a junior engineer is rarely the flashiest — it's making the next engineer's life easier through good APIs, instrumented systems, and a relentless habit of writing things down.\n\nI'd love the chance to bring that same instinct to Stripe's payments platform team. Thank you for considering my application; I've attached my resume and would welcome the opportunity to talk further.",
  closing: "Sincerely,\nAlex Chen",
  jobDescription: "",
};

export const DEFAULT_STATE: AppState = {
  resume: DEFAULT_RESUME,
  cover: DEFAULT_COVER,
  theme: "modern",
  view: "resume",
  margins: 0.75,
};

export { DEFAULT_RESUME, DEFAULT_COVER };

const STORAGE_KEY = "tucaken.resume-builder.v1";

// When true, setState skips localStorage writes (used when embedding the builder
// in a drawer with externally-provided data so the user's saved base resume is untouched).
let _ephemeral = false;
export function enterEphemeralMode() { _ephemeral = true; }
export function exitEphemeralMode() { _ephemeral = false; }

function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_STATE, ...parsed };
  } catch {
    return DEFAULT_STATE;
  }
}

function saveState(s: AppState) {
  if (_ephemeral) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* quota */
  }
}

type Listener = (s: AppState) => void;
const listeners: Set<Listener> = new Set();
let currentState: AppState = loadState();

export function getState(): AppState {
  return currentState;
}
export function setState(updater: (s: AppState) => AppState) {
  currentState = updater(currentState);
  saveState(currentState);
  listeners.forEach((l) => l(currentState));
}
export function subscribe(l: Listener) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  const [value, setValue] = React.useState(() => selector(currentState));
  React.useEffect(() => {
    const unsub = subscribe(() => setValue(selector(currentState)));
    return () => { unsub(); };
  }, []);
  return value;
}

export function updateResume(updater: (r: ResumeData) => ResumeData) {
  setState((s) => ({ ...s, resume: updater(s.resume) }));
}
export function updateCover(updater: (c: CoverLetterData) => CoverLetterData) {
  setState((s) => ({ ...s, cover: updater(s.cover) }));
}
export function setTheme(t: AppState["theme"]) {
  setState((s) => ({ ...s, theme: t }));
}
export function setView(v: AppState["view"]) {
  setState((s) => ({ ...s, view: v }));
}
export function setMargins(m: number) {
  setState((s) => ({ ...s, margins: m }));
}
export function resetState() {
  setState(() => DEFAULT_STATE);
}
