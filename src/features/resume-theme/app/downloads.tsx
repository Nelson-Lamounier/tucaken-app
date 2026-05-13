import html2canvas from 'html2canvas-pro'
import { jsPDF } from 'jspdf'
import type { ResumeData, CoverLetterData } from './state'
import type { ThemeName } from './themes'

export function sanitizeFilename(s: string) {
  return s.replace(/[^a-z0-9_\-]+/gi, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

export function buildResumeTxt(r: ResumeData): string {
  const lines: string[] = [];
  const rule = "=".repeat(60);
  lines.push(r.profile.name.toUpperCase());
  if (r.profile.title) lines.push(r.profile.title);
  const contact = [
    r.profile.email,
    r.profile.phone,
    r.profile.location,
    r.profile.linkedin,
    r.profile.github,
    r.profile.website,
  ].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  lines.push("");

  const sectionTitle = (t: string) => {
    lines.push("");
    lines.push(rule);
    lines.push(t.toUpperCase());
    lines.push(rule);
  };

  for (const key of r.sectionOrder) {
    switch (key) {
      case "summary":
        if (r.summary) {
          sectionTitle("Summary");
          lines.push(r.summary);
        }
        break;
      case "experience":
        if (r.experience.length) {
          sectionTitle("Experience");
          r.experience.forEach((e) => {
            lines.push(`${e.title}${e.company ? " — " + e.company : ""}${e.period ? "  (" + e.period + ")" : ""}`);
            if (e.location) lines.push(e.location);
            e.bullets.filter(Boolean).forEach((b) => lines.push("  - " + b));
            lines.push("");
          });
        }
        break;
      case "projects":
        if (r.projects.length) {
          sectionTitle("Projects");
          r.projects.forEach((p) => {
            lines.push(`${p.name}${p.stack ? "  ·  " + p.stack : ""}${p.url ? "  [" + p.url + "]" : ""}`);
            if (p.description) lines.push(p.description);
            p.bullets.filter(Boolean).forEach((b) => lines.push("  - " + b));
            lines.push("");
          });
        }
        break;
      case "education":
        if (r.education.length) {
          sectionTitle("Education");
          r.education.forEach((e) => {
            lines.push(`${e.degree}${e.institution ? " — " + e.institution : ""}${e.period ? "  (" + e.period + ")" : ""}`);
            if (e.location) lines.push(e.location);
            if (e.details) lines.push(e.details);
            lines.push("");
          });
        }
        break;
      case "skills":
        if (r.skills.length) {
          sectionTitle("Skills");
          r.skills.forEach((g) => lines.push(`${g.category}: ${g.skills}`));
        }
        break;
      case "certifications":
        if (r.certifications.length) {
          sectionTitle("Certifications");
          r.certifications.forEach((c) =>
            lines.push(`${c.name}${c.issuer ? " — " + c.issuer : ""}${c.year ? " (" + c.year + ")" : ""}`),
          );
        }
        break;
      case "languages":
        if (r.languages.length) {
          sectionTitle("Languages");
          r.languages.forEach((l) =>
            lines.push(`${l.name}${l.level ? " (" + l.level + ")" : ""}`),
          );
        }
        break;
      default: {
        const cs = r.custom.find((c) => c.id === key);
        if (cs && cs.entries.length) {
          sectionTitle(cs.title);
          cs.entries.forEach((en) => {
            if (en.heading || en.subheading) {
              lines.push(`${en.heading}${en.subheading ? "  ·  " + en.subheading : ""}`);
            }
            if (en.body) lines.push(en.body);
            lines.push("");
          });
        }
      }
    }
  }
  return lines.join("\n");
}

export function buildCoverTxt(r: ResumeData, c: CoverLetterData): string {
  const lines: string[] = [];
  lines.push(r.profile.name);
  const contact = [r.profile.email, r.profile.phone, r.profile.location].filter(Boolean).join(" | ");
  if (contact) lines.push(contact);
  lines.push("");
  if (c.date) lines.push(c.date);
  lines.push("");
  if (c.recipientName) lines.push(c.recipientName);
  if (c.recipientTitle) lines.push(c.recipientTitle);
  if (c.company) lines.push(c.company);
  if (c.companyAddress) lines.push(c.companyAddress);
  lines.push("");
  if (c.greeting) lines.push(c.greeting);
  lines.push("");
  lines.push(c.body);
  lines.push("");
  lines.push(c.closing);
  return lines.join("\n");
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTxt(content: string, baseName: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(blob, `${baseName}.txt`);
}

export function buildResumeDoc(r: ResumeData, theme: ThemeName, margin: number): string {
  const isClassic = theme === "classic";
  const baseFont = isClassic
    ? "'IBM Plex Serif', Georgia, 'Times New Roman', serif"
    : "'Inter', 'Helvetica Neue', Arial, sans-serif";
  const headLetterSpacing = isClassic ? "0.18em" : "0.16em";
  const marginIn = margin / 96;

  const sectionHtml = (title: string, body: string) => `
    <h2 style="font-size:11pt;font-weight:700;letter-spacing:${headLetterSpacing};
      text-transform:uppercase;border-bottom:1.5px solid #111;padding-bottom:3px;
      margin:14pt 0 6pt;">${escapeHtml(title)}</h2>${body}`;

  const bulletList = (bullets: string[]) =>
    bullets.filter(Boolean).length
      ? `<ul style="margin:4pt 0 0;padding-left:18pt;">${bullets
          .filter(Boolean)
          .map(
            (b) =>
              `<li style="font-size:10.5pt;line-height:1.5;margin-top:2pt;">${escapeHtml(b)}</li>`,
          )
          .join("")}</ul>`
      : "";

  const entryHead = (left: string, right: string, sub?: string) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12pt;">
      <div>${left}</div>
      <div style="font-size:10pt;color:#555;white-space:nowrap;">${escapeHtml(right || "")}</div>
    </div>
    ${sub ? `<div style="font-size:10pt;color:#666;font-style:italic;">${escapeHtml(sub)}</div>` : ""}`;

  let body = "";
  const headerStyle = isClassic
    ? `text-align:center;border-bottom:1.5px solid #111;padding-bottom:8pt;margin-bottom:12pt;`
    : `margin-bottom:14pt;`;
  body += `<header style="${headerStyle}">
    <h1 style="margin:0;font-size:${isClassic ? 22 : 26}pt;font-weight:${theme === "modern" ? 300 : 700};letter-spacing:${theme === "modern" ? "-0.02em" : "0.01em"};">${escapeHtml(r.profile.name)}</h1>
    ${r.profile.title ? `<div style="font-size:11pt;color:${theme === "modern" ? "#0d9488" : "#444"};letter-spacing:0.06em;text-transform:uppercase;margin-top:2pt;">${escapeHtml(r.profile.title)}</div>` : ""}
    <div style="font-size:10pt;color:#444;margin-top:6pt;">${[r.profile.email, r.profile.phone, r.profile.location, r.profile.linkedin, r.profile.github, r.profile.website].filter(Boolean).map(escapeHtml).join(" · ")}</div>
  </header>`;

  for (const key of r.sectionOrder) {
    switch (key) {
      case "summary":
        if (r.summary)
          body += sectionHtml("Summary", `<p style="margin:0;font-size:10.5pt;line-height:1.6;">${escapeHtml(r.summary)}</p>`);
        break;
      case "experience":
        if (r.experience.length)
          body += sectionHtml(
            "Experience",
            r.experience
              .map(
                (e) =>
                  `<div style="margin-top:8pt;">${entryHead(
                    `<span style="font-size:11pt;font-weight:700;">${escapeHtml(e.title)}</span>${e.company ? `<span style="font-weight:500;color:#333;"> — ${escapeHtml(e.company)}</span>` : ""}`,
                    e.period,
                    e.location,
                  )}${bulletList(e.bullets)}</div>`,
              )
              .join(""),
          );
        break;
      case "projects":
        if (r.projects.length)
          body += sectionHtml(
            "Projects",
            r.projects
              .map(
                (p) =>
                  `<div style="margin-top:8pt;">${entryHead(
                    `<span style="font-size:11pt;font-weight:700;">${escapeHtml(p.name)}</span>${p.stack ? `<span style="color:#555;font-size:10pt;"> · ${escapeHtml(p.stack)}</span>` : ""}`,
                    p.url,
                  )}${p.description ? `<div style="font-size:10.5pt;color:#222;margin-top:3pt;">${escapeHtml(p.description)}</div>` : ""}${bulletList(p.bullets)}</div>`,
              )
              .join(""),
          );
        break;
      case "education":
        if (r.education.length)
          body += sectionHtml(
            "Education",
            r.education
              .map(
                (e) =>
                  `<div style="margin-top:8pt;">${entryHead(
                    `<span style="font-size:11pt;font-weight:700;">${escapeHtml(e.degree)}</span>${e.institution ? `<span style="font-weight:500;color:#333;"> — ${escapeHtml(e.institution)}</span>` : ""}`,
                    e.period,
                    e.location,
                  )}${e.details ? `<div style="font-size:10.5pt;color:#222;margin-top:3pt;">${escapeHtml(e.details)}</div>` : ""}</div>`,
              )
              .join(""),
          );
        break;
      case "skills":
        if (r.skills.length)
          body += sectionHtml(
            "Skills",
            r.skills
              .map(
                (g) =>
                  `<div style="font-size:10.5pt;margin-top:3pt;"><span style="font-weight:700;">${escapeHtml(g.category)}:</span> ${escapeHtml(g.skills)}</div>`,
              )
              .join(""),
          );
        break;
      case "certifications":
        if (r.certifications.length)
          body += sectionHtml(
            "Certifications",
            r.certifications
              .map(
                (c) =>
                  `<div style="font-size:10.5pt;display:flex;justify-content:space-between;margin-top:3pt;"><span style="font-weight:600;">${escapeHtml(c.name)}</span><span style="color:#555;font-size:10pt;">${escapeHtml([c.issuer, c.year].filter(Boolean).join(" · "))}</span></div>`,
              )
              .join(""),
          );
        break;
      case "languages":
        if (r.languages.length)
          body += sectionHtml(
            "Languages",
            `<div style="font-size:10.5pt;">${r.languages.map((l) => `<span style="font-weight:600;">${escapeHtml(l.name)}</span>${l.level ? `<span style="color:#555;"> (${escapeHtml(l.level)})</span>` : ""}`).join(" · ")}</div>`,
          );
        break;
      default: {
        const cs = r.custom.find((c) => c.id === key);
        if (cs && cs.entries.length)
          body += sectionHtml(
            cs.title,
            cs.entries
              .map(
                (en) =>
                  `<div style="margin-top:6pt;">${(en.heading || en.subheading) ? entryHead(`<span style="font-size:11pt;font-weight:700;">${escapeHtml(en.heading)}</span>`, en.subheading || "") : ""}${en.body ? `<div style="font-size:10.5pt;margin-top:3pt;">${escapeHtml(en.body)}</div>` : ""}</div>`,
              )
              .join(""),
          );
      }
    }
  }

  return wordHtml(body, baseFont, marginIn);
}

export function buildCoverDoc(
  r: ResumeData,
  c: CoverLetterData,
  theme: ThemeName,
  margin: number,
): string {
  const baseFont =
    theme === "classic"
      ? "'IBM Plex Serif', Georgia, serif"
      : "'Inter', 'Helvetica Neue', Arial, sans-serif";
  const marginIn = margin / 96;
  const headerStyle =
    theme === "classic"
      ? "text-align:center;border-bottom:1.5px solid #111;padding-bottom:8pt;margin-bottom:18pt;"
      : "margin-bottom:18pt;";
  const body = `
    <header style="${headerStyle}">
      <h1 style="margin:0;font-size:22pt;font-weight:${theme === "modern" ? 300 : 700};">${escapeHtml(r.profile.name)}</h1>
      ${r.profile.title ? `<div style="font-size:11pt;color:${theme === "modern" ? "#0d9488" : "#444"};letter-spacing:0.06em;text-transform:uppercase;margin-top:2pt;">${escapeHtml(r.profile.title)}</div>` : ""}
      <div style="font-size:10pt;color:#444;margin-top:6pt;">${[r.profile.email, r.profile.phone, r.profile.location, r.profile.linkedin].filter(Boolean).map(escapeHtml).join(" · ")}</div>
    </header>
    <div style="font-size:11pt;margin-bottom:6pt;">${escapeHtml(c.date)}</div>
    <div style="font-size:11pt;line-height:1.5;margin-bottom:10pt;">
      ${[c.recipientName, c.recipientTitle, c.company, c.companyAddress]
        .filter(Boolean)
        .map((l) => escapeHtml(l).replace(/\n/g, "<br/>"))
        .join("<br/>")}
    </div>
    <div style="font-size:11pt;margin-bottom:8pt;">${escapeHtml(c.greeting)}</div>
    ${c.body
      .split(/\n\s*\n/)
      .filter((p) => p.trim())
      .map(
        (p) =>
          `<p style="font-size:11pt;line-height:1.65;margin:0 0 10pt;">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`,
      )
      .join("")}
    <div style="font-size:11pt;line-height:1.5;margin-top:14pt;">
      ${escapeHtml(c.closing).replace(/\n/g, "<br/>")}
    </div>
  `;
  return wordHtml(body, baseFont, marginIn);
}

function wordHtml(body: string, fontFamily: string, marginInches: number) {
  return `<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8"/>
<title>Document</title>
<!--[if gte mso 9]><xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
  @page WordSection1 { size: 8.5in 11in; margin: ${marginInches}in ${marginInches}in ${marginInches}in ${marginInches}in; }
  div.WordSection1 { page: WordSection1; }
  body { font-family: ${fontFamily}; color: #111; }
  p, h1, h2, ul, li { margin: 0; padding: 0; }
</style>
</head>
<body>
<div class="WordSection1">
${body}
</div>
</body>
</html>`;
}

function escapeHtml(s: string) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function downloadDoc(htmlContent: string, baseName: string) {
  const blob = new Blob(["﻿", htmlContent], { type: "application/msword" });
  downloadBlob(blob, `${baseName}.doc`);
}

export async function downloadPdf(docElementId: string, baseName: string) {
  const node = document.getElementById(docElementId);
  if (!node) throw new Error("doc element not found");

  const sheets = Array.from(
    node.querySelectorAll<HTMLElement>(".page-sheet .page-paper"),
  );
  if (!sheets.length) throw new Error("no pages");

  const originalTransform = node.style.transform;
  node.style.transform = "scale(1)";

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < sheets.length; i++) {
    const canvas = await html2canvas(sheets[i], {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      logging: false,
    });
    const imgData = canvas.toDataURL("image/png");
    if (i > 0) pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, 0, pageW, pageH);
  }

  node.style.transform = originalTransform;
  pdf.save(`${baseName}.pdf`);
}
