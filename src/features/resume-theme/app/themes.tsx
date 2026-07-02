import React from 'react'
import type {
  Profile,
  ResumeData,
  ExperienceEntry,
  ProjectEntry,
  EducationEntry,
  SkillGroup,
  CertEntry,
  LangEntry,
  CustomSection,
} from './state'
import { emailHref, telHref, urlHref } from './links'

export type ThemeName = "classic" | "modern" | "compact";

export type Block = {
  id: string;
  node: React.ReactNode;
  sticky?: boolean;
};

export type ThemeOpts = { margin: number; pageWidth: number };

type ContactItem = { value: string; href?: string };

function contactItems(p: Profile): ContactItem[] {
  const items: (ContactItem | null)[] = [
    p.email ? { value: p.email, href: emailHref(p.email) } : null,
    p.phone ? { value: p.phone, href: telHref(p.phone) } : null,
    p.location ? { value: p.location } : null,
    p.linkedin ? { value: p.linkedin, href: urlHref(p.linkedin) } : null,
    p.github ? { value: p.github, href: urlHref(p.github) } : null,
    p.website ? { value: p.website, href: urlHref(p.website) } : null,
  ];
  return items.filter((x): x is ContactItem => x !== null);
}

export function ContactRow({ p, sep = " · " }: { p: Profile; sep?: string }) {
  const items = contactItems(p);
  return (
    <div className="contact-row">
      {items.map((item, i) => (
        <React.Fragment key={item.value}>
          {i > 0 && <span className="sep">{sep}</span>}
          {item.href ? (
            <a className="contact-link" href={item.href} target="_blank" rel="noreferrer">
              {item.value}
            </a>
          ) : (
            <span>{item.value}</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function sectionsInOrder(data: ResumeData) {
  return data.sectionOrder.filter((key) => {
    switch (key) {
      case "summary":
        return !!data.summary.trim();
      case "experience":
        return data.experience.length > 0;
      case "education":
        return data.education.length > 0;
      case "projects":
        return data.projects.length > 0;
      case "skills":
        return data.skills.length > 0;
      case "certifications":
        return data.certifications.length > 0;
      case "languages":
        return data.languages.length > 0;
      default:
        return data.custom.some((c) => c.id === key && c.entries.length > 0);
    }
  });
}

function classicHeader(data: ResumeData) {
  return (
    <header className="theme-header classic-header">
      <h1 className="name">{data.profile.name}</h1>
      {data.profile.title && <div className="title">{data.profile.title}</div>}
      <ContactRow p={data.profile} sep=" · " />
    </header>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h2 className="sect-heading">{children}</h2>;
}

function ExperienceEntryBlock({ e }: { e: ExperienceEntry }) {
  return (
    <div className="entry experience-entry">
      <div className="entry-head">
        <div>
          <span className="entry-title">{e.title}</span>
          {e.company && <span className="entry-company"> — {e.company}</span>}
        </div>
        <span className="entry-period">{e.period}</span>
      </div>
      {e.location && <div className="entry-location">{e.location}</div>}
      {e.bullets.length > 0 && (
        <ul className="bullets">
          {e.bullets.filter(Boolean).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ProjectEntryBlock({ e }: { e: ProjectEntry }) {
  return (
    <div className="entry project-entry">
      <div className="entry-head">
        <div>
          <span className="entry-title">{e.name}</span>
          {e.stack && <span className="entry-meta"> · {e.stack}</span>}
        </div>
        {e.url && (
          <a
            className="entry-period mono contact-link"
            href={urlHref(e.url)}
            target="_blank"
            rel="noreferrer"
          >
            {e.url}
          </a>
        )}
      </div>
      {e.description && <div className="entry-desc">{e.description}</div>}
      {e.bullets.length > 0 && (
        <ul className="bullets">
          {e.bullets.filter(Boolean).map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EducationEntryBlock({ e }: { e: EducationEntry }) {
  return (
    <div className="entry education-entry">
      <div className="entry-head">
        <div>
          <span className="entry-title">{e.degree}</span>
          {e.institution && <span className="entry-company"> — {e.institution}</span>}
        </div>
        <span className="entry-period">{e.period}</span>
      </div>
      {e.location && <div className="entry-location">{e.location}</div>}
      {e.details && <div className="entry-desc">{e.details}</div>}
    </div>
  );
}

function SkillsBlock({ groups }: { groups: SkillGroup[] }) {
  return (
    <div className="skills-block">
      {groups.map((g) => (
        <div key={g.id} className="skill-row">
          <span className="skill-cat">{g.category}:</span>
          <span className="skill-list">{g.skills}</span>
        </div>
      ))}
    </div>
  );
}

function CertBlock({ items }: { items: CertEntry[] }) {
  return (
    <div className="cert-block">
      {items.map((c) => (
        <div key={c.id} className="cert-row">
          <span className="cert-name">{c.name}</span>
          <span className="cert-meta">
            {c.issuer}
            {c.year ? ` · ${c.year}` : ""}
          </span>
        </div>
      ))}
    </div>
  );
}

function LangBlock({ items }: { items: LangEntry[] }) {
  return (
    <div className="lang-block">
      {items.map((l, i) => (
        <span key={l.id}>
          {i > 0 && <span className="sep"> · </span>}
          <span className="lang-name">{l.name}</span>
          {l.level && <span className="lang-level"> ({l.level})</span>}
        </span>
      ))}
    </div>
  );
}

function CustomEntryBlock({ entry }: { entry: CustomSection["entries"][number] }) {
  return (
    <div className="entry custom-entry">
      {(entry.heading || entry.subheading) && (
        <div className="entry-head">
          <span className="entry-title">{entry.heading}</span>
          {entry.subheading && <span className="entry-period">{entry.subheading}</span>}
        </div>
      )}
      {entry.body && <div className="entry-desc">{entry.body}</div>}
    </div>
  );
}

export const SECTION_LABEL: Record<string, string> = {
  summary: "Summary",
  experience: "Experience",
  education: "Education",
  projects: "Projects",
  skills: "Skills",
  certifications: "Certifications",
  languages: "Languages",
};

function blocksForSection(
  key: string,
  data: ResumeData,
  HeadingComp: typeof SectionHeading,
): Block[] {
  const label =
    SECTION_LABEL[key] ?? data.custom.find((c) => c.id === key)?.title ?? "Section";
  const heading = <HeadingComp>{label}</HeadingComp>;

  const out: Block[] = [];
  const pushHeadingPair = (firstNode: React.ReactNode) => {
    out.push({
      id: `${key}-head`,
      node: (
        <div className="sect-group">
          {heading}
          {firstNode}
        </div>
      ),
    });
  };

  switch (key) {
    case "summary":
      out.push({
        id: "summary-block",
        node: (
          <div className="sect-group">
            {heading}
            <p className="summary-text">{data.summary}</p>
          </div>
        ),
      });
      break;
    case "experience": {
      const items = data.experience;
      if (!items.length) break;
      pushHeadingPair(<ExperienceEntryBlock e={items[0]} />);
      items.slice(1).forEach((e) => {
        out.push({ id: `exp-${e.id}`, node: <ExperienceEntryBlock e={e} /> });
      });
      break;
    }
    case "projects": {
      const items = data.projects;
      if (!items.length) break;
      pushHeadingPair(<ProjectEntryBlock e={items[0]} />);
      items.slice(1).forEach((e) => {
        out.push({ id: `proj-${e.id}`, node: <ProjectEntryBlock e={e} /> });
      });
      break;
    }
    case "education": {
      const items = data.education;
      if (!items.length) break;
      pushHeadingPair(<EducationEntryBlock e={items[0]} />);
      items.slice(1).forEach((e) => {
        out.push({ id: `edu-${e.id}`, node: <EducationEntryBlock e={e} /> });
      });
      break;
    }
    case "skills":
      out.push({
        id: "skills-block",
        node: (
          <div className="sect-group">
            {heading}
            <SkillsBlock groups={data.skills} />
          </div>
        ),
      });
      break;
    case "certifications":
      out.push({
        id: "cert-block",
        node: (
          <div className="sect-group">
            {heading}
            <CertBlock items={data.certifications} />
          </div>
        ),
      });
      break;
    case "languages":
      out.push({
        id: "lang-block",
        node: (
          <div className="sect-group">
            {heading}
            <LangBlock items={data.languages} />
          </div>
        ),
      });
      break;
    default: {
      const cs = data.custom.find((c) => c.id === key);
      if (!cs || !cs.entries.length) break;
      pushHeadingPair(<CustomEntryBlock entry={cs.entries[0]} />);
      cs.entries.slice(1).forEach((en) => {
        out.push({ id: `cust-${en.id}`, node: <CustomEntryBlock entry={en} /> });
      });
    }
  }
  return out;
}

export function getResumeBlocks(data: ResumeData): Block[] {
  const blocks: Block[] = [{ id: "header", node: classicHeader(data) }];
  const order = sectionsInOrder(data);
  for (const key of order) {
    blocks.push(...blocksForSection(key, data, SectionHeading));
  }
  return blocks;
}

export const THEME_CSS = `
.resume-doc { font-family: 'Inter', system-ui, sans-serif; color: #111; line-height: 1.45; }

/* Header — base; themes override below */
.resume-doc .theme-header { margin-bottom: 14px; }
.resume-doc .theme-header .name { margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.01em; }
.resume-doc .theme-header .title { margin-top: 2px; font-size: 12px; color: #444; letter-spacing: 0.04em; text-transform: uppercase; font-weight: 500; }
.resume-doc .contact-row { margin-top: 8px; font-size: 10.5px; color: #444; }
.resume-doc .contact-row span:not(.sep), .resume-doc .contact-row a { white-space: nowrap; }
.resume-doc .contact-row .sep { color: #bbb; padding: 0 6px; }
.resume-doc .contact-link { color: inherit; text-decoration: none; }
.resume-doc .contact-link:hover { text-decoration: underline; }

/* Section heading — base */
.resume-doc .sect-heading {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #111;
  padding-bottom: 4px;
  border-bottom: 1.2px solid #111;
}

.resume-doc .sect-group { display: flex; flex-direction: column; gap: 6px; }
.resume-doc .entry { font-size: 10.5px; }
.resume-doc .entry + .entry, .resume-doc .sect-group + .sect-group { margin-top: 10px; }
.resume-doc .entry-head {
  display: flex; justify-content: space-between; align-items: baseline;
  gap: 12px; flex-wrap: wrap;
}
.resume-doc .entry-head > div:first-child {
  flex: 1 1 60%; min-width: 0;
}
.resume-doc .entry-title { font-weight: 700; color: #111; font-size: 11px; }
.resume-doc .entry-company { font-weight: 500; color: #333; font-size: 10.5px; }
.resume-doc .entry-meta { color: #555; font-size: 10px; }
.resume-doc .entry-period { font-size: 10px; color: #555; font-variant-numeric: tabular-nums; white-space: nowrap; }
.resume-doc .entry-period.mono { font-family: 'JetBrains Mono', monospace; }
.resume-doc .entry-location { font-size: 10px; color: #666; font-style: italic; margin-top: 1px; }
.resume-doc .entry-desc { font-size: 10.5px; color: #222; margin-top: 4px; line-height: 1.5; }
.resume-doc .bullets { margin: 4px 0 0; padding: 0 0 0 16px; list-style: disc outside; }
.resume-doc .bullets li { font-size: 10.5px; color: #222; line-height: 1.5; margin-top: 2px; list-style: disc outside; }

.resume-doc .summary-text { margin: 0; font-size: 10.5px; line-height: 1.6; color: #222; }

.resume-doc .skill-row { display: flex; gap: 6px; font-size: 10.5px; margin-top: 3px; }
.resume-doc .skill-cat { font-weight: 700; min-width: 96px; color: #111; }
.resume-doc .skill-list { color: #222; flex: 1; }

.resume-doc .cert-row { display: flex; justify-content: space-between; font-size: 10.5px; margin-top: 3px; }
.resume-doc .cert-name { font-weight: 600; color: #111; }
.resume-doc .cert-meta { color: #555; font-size: 10px; }

.resume-doc .lang-block { font-size: 10.5px; color: #222; }
.resume-doc .lang-name { font-weight: 600; }
.resume-doc .lang-level { color: #555; }
.resume-doc .lang-block .sep { color: #bbb; }

/* ── CLASSIC theme ── */
.resume-doc.theme-classic {
  font-family: 'IBM Plex Serif', Georgia, 'Times New Roman', serif;
}
.resume-doc.theme-classic .theme-header { text-align: center; border-bottom: 1.5px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
.resume-doc.theme-classic .theme-header .name { font-size: 26px; letter-spacing: 0.02em; }
.resume-doc.theme-classic .contact-row { justify-content: center; }
.resume-doc.theme-classic .sect-heading {
  font-family: 'IBM Plex Serif', serif;
  letter-spacing: 0.18em;
  border-bottom: 1.5px solid #111;
}

/* ── MODERN theme ── */
.resume-doc.theme-modern { font-family: 'Inter', system-ui, sans-serif; }
.resume-doc.theme-modern .theme-header .name { font-size: 32px; font-weight: 300; letter-spacing: -0.02em; }
.resume-doc.theme-modern .theme-header .title { color: var(--accent, #0d9488); letter-spacing: 0.12em; font-weight: 500; }
.resume-doc.theme-modern .sect-heading {
  border: 0;
  padding: 0;
  color: var(--accent, #0d9488);
  letter-spacing: 0.18em;
  font-size: 10.5px;
  margin-bottom: 6px;
}
.resume-doc.theme-modern .sect-group + .sect-group { margin-top: 14px; }
.resume-doc.theme-modern .entry-title { font-weight: 600; }

/* ── COMPACT theme ── */
.resume-doc.theme-compact { font-family: 'Inter', system-ui, sans-serif; line-height: 1.35; }
.resume-doc.theme-compact .theme-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
.resume-doc.theme-compact .theme-header .name { font-size: 22px; }
.resume-doc.theme-compact .theme-header .title { margin-top: 1px; font-size: 10px; }
.resume-doc.theme-compact .theme-header > div:first-child { display: flex; flex-direction: column; }
.resume-doc.theme-compact .contact-row { font-size: 9.5px; text-align: right; justify-content: flex-end; max-width: 50%; }
.resume-doc.theme-compact .sect-heading { font-size: 10px; padding-bottom: 2px; border-bottom: 1px solid #999; margin-bottom: 5px; letter-spacing: 0.14em; }
.resume-doc.theme-compact .sect-group + .sect-group { margin-top: 8px; }
.resume-doc.theme-compact .entry-title { font-size: 10.5px; }
.resume-doc.theme-compact .entry-period { font-size: 9.5px; }
.resume-doc.theme-compact .bullets li { font-size: 10px; line-height: 1.4; margin-top: 1px; }
.resume-doc.theme-compact .summary-text { font-size: 10px; line-height: 1.45; }
.resume-doc.theme-compact .entry + .entry { margin-top: 6px; }
.resume-doc.theme-compact .skill-cat { min-width: 80px; }

/* Theme-aware compact header reorder */
.resume-doc.theme-compact .theme-header { flex-direction: row; }
`;
