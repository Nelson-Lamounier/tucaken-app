import React from 'react'
import type {
  Profile,
  ExperienceEntry,
  EducationEntry,
  ProjectEntry,
  SkillGroup,
  CertEntry,
  LangEntry,
  CustomSection,
  CoverLetterData,
} from './state'
import { updateResume, updateCover, useStore, uid } from './state'

function Field({
  label,
  value,
  onChange,
  placeholder,
  small,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  small?: boolean;
}) {
  return (
    <label className="fld">
      <span className="fld-lbl">{label}</span>
      <input
        className={`fld-inp${small ? " sm" : ""}`}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="fld">
      {label && <span className="fld-lbl">{label}</span>}
      <textarea
        className="fld-ta"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-btn${danger ? " danger" : ""}`}
      onClick={onClick}
      title={title}
    >
      {children}
    </button>
  );
}

export function Accordion({
  title,
  count,
  children,
  defaultOpen,
  onMoveUp,
  onMoveDown,
  onRemove,
  removable,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  defaultOpen?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onRemove?: () => void;
  removable?: boolean;
}) {
  const [open, setOpen] = React.useState(!!defaultOpen);
  return (
    <div className={`acc${open ? " open" : ""}`}>
      <div className="acc-hd">
        <button
          type="button"
          className="acc-toggle"
          onClick={() => setOpen((o) => !o)}
        >
          <span className="caret">{open ? "▾" : "▸"}</span>
          <span className="acc-title">{title}</span>
          {typeof count === "number" && <span className="acc-count">{count}</span>}
        </button>
        <div className="acc-actions">
          {onMoveUp && <IconBtn onClick={onMoveUp} title="Move up">↑</IconBtn>}
          {onMoveDown && <IconBtn onClick={onMoveDown} title="Move down">↓</IconBtn>}
          {removable && onRemove && (
            <IconBtn onClick={onRemove} title="Remove section" danger>×</IconBtn>
          )}
        </div>
      </div>
      {open && <div className="acc-body">{children}</div>}
    </div>
  );
}

export function moveItem<T>(arr: T[], idx: number, dir: -1 | 1): T[] {
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return arr;
  const next = arr.slice();
  [next[idx], next[j]] = [next[j], next[idx]];
  return next;
}

export function ProfileEditor({ p }: { p: Profile }) {
  const upd = (k: keyof Profile, v: string) =>
    updateResume((r) => ({ ...r, profile: { ...r.profile, [k]: v } }));
  return (
    <div className="grid-2col">
      <Field label="Full name" value={p.name} onChange={(v) => upd("name", v)} />
      <Field label="Title / target role" value={p.title} onChange={(v) => upd("title", v)} />
      <Field label="Email" value={p.email} onChange={(v) => upd("email", v)} />
      <Field label="Phone" value={p.phone} onChange={(v) => upd("phone", v)} />
      <Field label="Location" value={p.location} onChange={(v) => upd("location", v)} />
      <Field label="LinkedIn" value={p.linkedin} onChange={(v) => upd("linkedin", v)} />
      <Field label="GitHub" value={p.github} onChange={(v) => upd("github", v)} />
      <Field label="Website / portfolio" value={p.website} onChange={(v) => upd("website", v)} />
    </div>
  );
}

export function SummaryEditor({ value }: { value: string }) {
  return (
    <TextArea
      value={value}
      onChange={(v) => updateResume((r) => ({ ...r, summary: v }))}
      rows={4}
      placeholder="2–4 sentences. Lead with your strongest credential."
    />
  );
}

export function ExperienceEditor({ items }: { items: ExperienceEntry[] }) {
  const set = (next: ExperienceEntry[]) =>
    updateResume((r) => ({ ...r, experience: next }));
  const add = () => {
    const e: ExperienceEntry = {
      id: uid(),
      title: "",
      company: "",
      location: "",
      period: "",
      bullets: [""],
    };
    set([...items, e]);
  };
  const remove = (id: string) => set(items.filter((x) => x.id !== id));
  const move = (idx: number, dir: -1 | 1) => set(moveItem(items, idx, dir));
  const update = (id: string, patch: Partial<ExperienceEntry>) =>
    set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  return (
    <div className="entries">
      {items.map((e, idx) => (
        <div key={e.id} className="entry-card">
          <div className="entry-card-head">
            <span className="entry-card-title">
              {e.title || e.company || "Untitled role"}
            </span>
            <div className="entry-card-actions">
              <IconBtn onClick={() => move(idx, -1)} title="Move up">↑</IconBtn>
              <IconBtn onClick={() => move(idx, 1)} title="Move down">↓</IconBtn>
              <IconBtn onClick={() => remove(e.id)} title="Remove" danger>×</IconBtn>
            </div>
          </div>
          <div className="grid-2col">
            <Field label="Title" value={e.title} onChange={(v) => update(e.id, { title: v })} />
            <Field label="Company" value={e.company} onChange={(v) => update(e.id, { company: v })} />
            <Field label="Location" value={e.location} onChange={(v) => update(e.id, { location: v })} />
            <Field label="Period" value={e.period} onChange={(v) => update(e.id, { period: v })} placeholder="Jun 2025 — Aug 2025" />
          </div>
          <BulletList
            bullets={e.bullets}
            onChange={(b) => update(e.id, { bullets: b })}
          />
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add role</button>
    </div>
  );
}

function BulletList({
  bullets,
  onChange,
}: {
  bullets: string[];
  onChange: (b: string[]) => void;
}) {
  const setB = (i: number, v: string) => {
    const next = bullets.slice();
    next[i] = v;
    onChange(next);
  };
  return (
    <div className="bullets-edit">
      <div className="fld-lbl">Bullets</div>
      {bullets.map((b, i) => (
        <div key={i} className="bullet-row">
          <span className="bullet-dot">•</span>
          <textarea
            className="fld-ta bullet-ta"
            value={b}
            rows={2}
            placeholder="Quantify impact. Lead with a strong verb."
            onChange={(e) => setB(i, e.target.value)}
          />
          <IconBtn
            onClick={() => onChange(bullets.filter((_, j) => j !== i))}
            title="Remove bullet"
            danger
          >
            ×
          </IconBtn>
        </div>
      ))}
      <button
        type="button"
        className="add-sub-btn"
        onClick={() => onChange([...bullets, ""])}
      >
        + Add bullet
      </button>
    </div>
  );
}

export function EducationEditor({ items }: { items: EducationEntry[] }) {
  const set = (next: EducationEntry[]) =>
    updateResume((r) => ({ ...r, education: next }));
  const add = () =>
    set([
      ...items,
      {
        id: uid(),
        degree: "",
        institution: "",
        location: "",
        period: "",
        details: "",
      },
    ]);
  const remove = (id: string) => set(items.filter((x) => x.id !== id));
  const move = (idx: number, dir: -1 | 1) => set(moveItem(items, idx, dir));
  const update = (id: string, patch: Partial<EducationEntry>) =>
    set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="entries">
      {items.map((e, idx) => (
        <div key={e.id} className="entry-card">
          <div className="entry-card-head">
            <span className="entry-card-title">
              {e.degree || e.institution || "Untitled"}
            </span>
            <div className="entry-card-actions">
              <IconBtn onClick={() => move(idx, -1)} title="Move up">↑</IconBtn>
              <IconBtn onClick={() => move(idx, 1)} title="Move down">↓</IconBtn>
              <IconBtn onClick={() => remove(e.id)} title="Remove" danger>×</IconBtn>
            </div>
          </div>
          <div className="grid-2col">
            <Field label="Degree" value={e.degree} onChange={(v) => update(e.id, { degree: v })} />
            <Field label="Institution" value={e.institution} onChange={(v) => update(e.id, { institution: v })} />
            <Field label="Location" value={e.location} onChange={(v) => update(e.id, { location: v })} />
            <Field label="Period" value={e.period} onChange={(v) => update(e.id, { period: v })} />
          </div>
          <TextArea
            label="Details (GPA, coursework, honors)"
            value={e.details}
            rows={2}
            onChange={(v) => update(e.id, { details: v })}
          />
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add education</button>
    </div>
  );
}

export function ProjectsEditor({ items }: { items: ProjectEntry[] }) {
  const set = (next: ProjectEntry[]) =>
    updateResume((r) => ({ ...r, projects: next }));
  const add = () =>
    set([
      ...items,
      { id: uid(), name: "", stack: "", url: "", description: "", bullets: [""] },
    ]);
  const remove = (id: string) => set(items.filter((x) => x.id !== id));
  const move = (idx: number, dir: -1 | 1) => set(moveItem(items, idx, dir));
  const update = (id: string, patch: Partial<ProjectEntry>) =>
    set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="entries">
      {items.map((e, idx) => (
        <div key={e.id} className="entry-card">
          <div className="entry-card-head">
            <span className="entry-card-title">{e.name || "Untitled project"}</span>
            <div className="entry-card-actions">
              <IconBtn onClick={() => move(idx, -1)} title="Move up">↑</IconBtn>
              <IconBtn onClick={() => move(idx, 1)} title="Move down">↓</IconBtn>
              <IconBtn onClick={() => remove(e.id)} title="Remove" danger>×</IconBtn>
            </div>
          </div>
          <div className="grid-2col">
            <Field label="Name" value={e.name} onChange={(v) => update(e.id, { name: v })} />
            <Field label="Stack" value={e.stack} onChange={(v) => update(e.id, { stack: v })} />
            <Field label="URL / Repo" value={e.url} onChange={(v) => update(e.id, { url: v })} />
          </div>
          <BulletList
            bullets={e.bullets}
            onChange={(b) => update(e.id, { bullets: b })}
          />
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add project</button>
    </div>
  );
}

export function SkillsEditor({ items }: { items: SkillGroup[] }) {
  const set = (next: SkillGroup[]) =>
    updateResume((r) => ({ ...r, skills: next }));
  const add = () => set([...items, { id: uid(), category: "", skills: "" }]);
  const remove = (id: string) => set(items.filter((x) => x.id !== id));
  const move = (idx: number, dir: -1 | 1) => set(moveItem(items, idx, dir));
  const update = (id: string, patch: Partial<SkillGroup>) =>
    set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="entries">
      {items.map((s, idx) => (
        <div key={s.id} className="entry-card compact-card">
          <div className="grid-cat-skills">
            <Field label="Category" value={s.category} onChange={(v) => update(s.id, { category: v })} placeholder="Languages" />
            <Field label="Items (comma-separated)" value={s.skills} onChange={(v) => update(s.id, { skills: v })} placeholder="TypeScript, Python, Go" />
            <div className="row-actions">
              <IconBtn onClick={() => move(idx, -1)} title="Move up">↑</IconBtn>
              <IconBtn onClick={() => move(idx, 1)} title="Move down">↓</IconBtn>
              <IconBtn onClick={() => remove(s.id)} title="Remove" danger>×</IconBtn>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add skill group</button>
    </div>
  );
}

export function CertsEditor({ items }: { items: CertEntry[] }) {
  const set = (next: CertEntry[]) =>
    updateResume((r) => ({ ...r, certifications: next }));
  const add = () => set([...items, { id: uid(), name: "", issuer: "", year: "" }]);
  const remove = (id: string) => set(items.filter((x) => x.id !== id));
  const move = (idx: number, dir: -1 | 1) => set(moveItem(items, idx, dir));
  const update = (id: string, patch: Partial<CertEntry>) =>
    set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="entries">
      {items.map((c, idx) => (
        <div key={c.id} className="entry-card compact-card">
          <div className="grid-cert">
            <Field label="Name" value={c.name} onChange={(v) => update(c.id, { name: v })} />
            <Field label="Issuer" value={c.issuer} onChange={(v) => update(c.id, { issuer: v })} />
            <Field label="Year" value={c.year} onChange={(v) => update(c.id, { year: v })} />
            <div className="row-actions">
              <IconBtn onClick={() => move(idx, -1)} title="Move up">↑</IconBtn>
              <IconBtn onClick={() => move(idx, 1)} title="Move down">↓</IconBtn>
              <IconBtn onClick={() => remove(c.id)} title="Remove" danger>×</IconBtn>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add certification</button>
    </div>
  );
}

export function LangEditor({ items }: { items: LangEntry[] }) {
  const set = (next: LangEntry[]) =>
    updateResume((r) => ({ ...r, languages: next }));
  const add = () => set([...items, { id: uid(), name: "", level: "" }]);
  const remove = (id: string) => set(items.filter((x) => x.id !== id));
  const update = (id: string, patch: Partial<LangEntry>) =>
    set(items.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  return (
    <div className="entries">
      {items.map((l) => (
        <div key={l.id} className="entry-card compact-card">
          <div className="grid-lang">
            <Field label="Language" value={l.name} onChange={(v) => update(l.id, { name: v })} />
            <Field label="Level" value={l.level} onChange={(v) => update(l.id, { level: v })} placeholder="Native · Fluent · Conversational" />
            <div className="row-actions">
              <IconBtn onClick={() => remove(l.id)} title="Remove" danger>×</IconBtn>
            </div>
          </div>
        </div>
      ))}
      <button type="button" className="add-btn" onClick={add}>+ Add language</button>
    </div>
  );
}

export function CustomEditor({ section }: { section: CustomSection }) {
  const update = (patch: Partial<CustomSection>) =>
    updateResume((r) => ({
      ...r,
      custom: r.custom.map((c) => (c.id === section.id ? { ...c, ...patch } : c)),
    }));
  const updateEntry = (
    id: string,
    patch: Partial<CustomSection["entries"][number]>,
  ) =>
    update({
      entries: section.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    });
  const addEntry = () =>
    update({
      entries: [
        ...section.entries,
        { id: uid(), heading: "", subheading: "", body: "" },
      ],
    });
  const removeEntry = (id: string) =>
    update({ entries: section.entries.filter((e) => e.id !== id) });
  return (
    <div className="entries">
      <Field
        label="Section title"
        value={section.title}
        onChange={(v) => update({ title: v })}
        placeholder="e.g. Publications, Volunteering, Awards"
      />
      {section.entries.map((e) => (
        <div key={e.id} className="entry-card">
          <div className="entry-card-head">
            <span className="entry-card-title">{e.heading || "Entry"}</span>
            <IconBtn onClick={() => removeEntry(e.id)} title="Remove" danger>×</IconBtn>
          </div>
          <div className="grid-2col">
            <Field label="Heading" value={e.heading} onChange={(v) => updateEntry(e.id, { heading: v })} />
            <Field label="Subheading / date" value={e.subheading} onChange={(v) => updateEntry(e.id, { subheading: v })} />
          </div>
          <TextArea label="Body" value={e.body} rows={2} onChange={(v) => updateEntry(e.id, { body: v })} />
        </div>
      ))}
      <button type="button" className="add-btn" onClick={addEntry}>+ Add entry</button>
    </div>
  );
}

export function CoverEditor() {
  const cover = useStore((s) => s.cover);
  const upd = <K extends keyof CoverLetterData>(k: K, v: CoverLetterData[K]) =>
    updateCover((c) => ({ ...c, [k]: v }));
  return (
    <div className="cover-edit">
      <Accordion title="Recipient" defaultOpen>
        <div className="grid-2col">
          <Field label="Date" value={cover.date} onChange={(v) => upd("date", v)} />
          <Field label="Recipient name" value={cover.recipientName} onChange={(v) => upd("recipientName", v)} />
          <Field label="Recipient title" value={cover.recipientTitle} onChange={(v) => upd("recipientTitle", v)} />
          <Field label="Company" value={cover.company} onChange={(v) => upd("company", v)} />
        </div>
        <TextArea
          label="Company address"
          value={cover.companyAddress}
          rows={2}
          onChange={(v) => upd("companyAddress", v)}
        />
      </Accordion>

      <Accordion title="Letter" defaultOpen>
        <Field
          label="Greeting"
          value={cover.greeting}
          onChange={(v) => upd("greeting", v)}
          placeholder="Dear Hiring Manager,"
        />
        <TextArea
          label="Body"
          value={cover.body}
          rows={12}
          onChange={(v) => upd("body", v)}
          placeholder="Open with why this company, then 2 paragraphs of relevant evidence, then a brief close."
        />
        <TextArea
          label="Closing"
          value={cover.closing}
          rows={2}
          onChange={(v) => upd("closing", v)}
        />
      </Accordion>

      <Accordion title="Job description (reference)">
        <TextArea
          value={cover.jobDescription}
          rows={6}
          onChange={(v) => upd("jobDescription", v)}
          placeholder="Paste the JD here as a scratch pad while you tailor your letter."
        />
        <div className="hint">
          Note: AI generation is off by default. Paste the JD and write the
          letter yourself, or use the body field as a starting point.
        </div>
      </Accordion>
    </div>
  );
}
