import React from 'react'
import type { ResumeData, CoverLetterData } from './state'
import type { Block, ThemeName } from './themes'
import { ContactRow } from './themes'

export const A4_W = 794;
export const A4_H = 1123;
const BLOCK_GAP = 10;

type PaginatedDocProps = {
  blocks: Block[];
  margin: number;
  theme: ThemeName;
  scale?: number;
  coverMode?: boolean;
  domId?: string;
};

export function PaginatedDoc({
  blocks,
  margin,
  theme,
  scale = 1,
  coverMode = false,
  domId,
}: PaginatedDocProps) {
  const measureRef = React.useRef<HTMLDivElement>(null);
  const [pages, setPages] = React.useState<string[][]>(() => [
    blocks.map((b) => b.id),
  ]);

  React.useLayoutEffect(() => {
    const node = measureRef.current;
    if (!node) return;

    const heights: Record<string, number> = {};
    node.querySelectorAll<HTMLElement>("[data-block-id]").forEach((el) => {
      // offsetHeight returns layout pixels, unaffected by ancestor CSS transforms
      heights[el.dataset.blockId!] = el.offsetHeight;
    });

    const contentH = A4_H - margin * 2;
    const newPages: string[][] = [[]];
    let pageH = 0;

    for (const b of blocks) {
      const h = heights[b.id] ?? 0;
      const withGap = (newPages[newPages.length - 1].length > 0 ? BLOCK_GAP : 0) + h;

      if (h > contentH) {
        if (newPages[newPages.length - 1].length === 0) {
          newPages[newPages.length - 1].push(b.id);
        } else {
          newPages.push([b.id]);
        }
        pageH = h;
        continue;
      }
      if (pageH + withGap > contentH && newPages[newPages.length - 1].length > 0) {
        newPages.push([b.id]);
        pageH = h;
      } else {
        newPages[newPages.length - 1].push(b.id);
        pageH += withGap;
      }
    }
    setPages(newPages);
  }, [blocks, margin, theme]);

  const contentW = A4_W - margin * 2;

  const blockMap = React.useMemo(() => {
    const m: Record<string, Block> = {};
    for (const b of blocks) m[b.id] = b;
    return m;
  }, [blocks]);

  return (
    <div
      id={domId}
      className="paginated-doc"
      style={{
        transform: `scale(${scale})`,
        transformOrigin: "top center",
        width: A4_W,
      }}
    >
      {/* OFF-SCREEN MEASUREMENT LAYER */}
      <div
        ref={measureRef}
        aria-hidden="true"
        className={`resume-doc theme-${theme}${coverMode ? " cover-mode" : ""}`}
        style={{
          position: "absolute",
          left: -99999,
          top: 0,
          width: contentW,
          padding: 0,
          visibility: "hidden",
        }}
      >
        {blocks.map((b) => (
          <div key={b.id} data-block-id={b.id} style={{ marginTop: BLOCK_GAP }}>
            {b.node}
          </div>
        ))}
      </div>

      {/* VISIBLE PAGES */}
      {pages.map((pageIds, pageIdx) => (
        <PageSheet key={pageIdx} pageIdx={pageIdx} total={pages.length}>
          <div
            className={`resume-doc theme-${theme}${coverMode ? " cover-mode" : ""}`}
            style={{ padding: `${margin}px ${margin}px` }}
          >
            <div className="page-content">
              {pageIds.map((id, i) => {
                const b = blockMap[id];
                if (!b) return null;
                return (
                  <div
                    key={id}
                    style={{ marginTop: i === 0 ? 0 : BLOCK_GAP }}
                    data-print-id={id}
                  >
                    {b.node}
                  </div>
                );
              })}
            </div>
          </div>
        </PageSheet>
      ))}
    </div>
  );
}

function PageSheet({
  children,
  pageIdx,
  total,
}: {
  children: React.ReactNode;
  pageIdx: number;
  total: number;
}) {
  return (
    <div className="page-sheet" data-page={pageIdx + 1}>
      <div className="page-paper">{children}</div>
      <div className="page-meta">
        Page {pageIdx + 1} of {total}
      </div>
    </div>
  );
}

export function getCoverBlocks(
  resume: ResumeData,
  cover: CoverLetterData,
): Block[] {
  const blocks: Block[] = [];

  blocks.push({
    id: "cover-header",
    node: (
      <header className="theme-header cover-header">
        <h1 className="name">{resume.profile.name}</h1>
        {resume.profile.title && (
          <div className="title">{resume.profile.title}</div>
        )}
        <ContactRow p={resume.profile} sep=" · " />
      </header>
    ),
  });

  if (cover.date) {
    blocks.push({
      id: "cover-date",
      node: <div className="cover-date">{cover.date}</div>,
    });
  }

  if (cover.recipientName || cover.company) {
    blocks.push({
      id: "cover-recipient",
      node: (
        <div className="cover-recipient">
          {cover.recipientName && <div>{cover.recipientName}</div>}
          {cover.recipientTitle && <div>{cover.recipientTitle}</div>}
          {cover.company && <div>{cover.company}</div>}
          {cover.companyAddress &&
            cover.companyAddress.split("\n").map((line, i) => (
              <div key={i}>{line}</div>
            ))}
        </div>
      ),
    });
  }

  if (cover.greeting) {
    blocks.push({
      id: "cover-greeting",
      node: <div className="cover-greeting">{cover.greeting}</div>,
    });
  }

  const paras = cover.body
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  paras.forEach((p, i) => {
    blocks.push({
      id: `cover-para-${i}`,
      node: <p className="cover-para">{p}</p>,
    });
  });

  if (cover.closing) {
    const lines = cover.closing.split("\n");
    blocks.push({
      id: "cover-closing",
      node: (
        <div className="cover-closing">
          {lines.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      ),
    });
  }

  return blocks;
}

export const COVER_CSS = `
.resume-doc.cover-mode .cover-header { margin-bottom: 24px; }
.resume-doc.cover-mode.theme-classic .cover-header { text-align: center; border-bottom: 1.5px solid #111; padding-bottom: 10px; }
.resume-doc.cover-mode.theme-modern .cover-header { border-bottom: 0; }
.resume-doc.cover-mode.theme-compact .cover-header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 1.2px solid #111; padding-bottom: 6px; }

.resume-doc.cover-mode .cover-date { font-size: 11px; color: #333; margin-bottom: 4px; }
.resume-doc.cover-mode .cover-recipient { font-size: 11px; color: #222; line-height: 1.5; margin-bottom: 8px; }
.resume-doc.cover-mode .cover-greeting { font-size: 11px; margin-bottom: 4px; color: #111; }
.resume-doc.cover-mode .cover-para {
  font-size: 11px;
  line-height: 1.65;
  color: #222;
  margin: 0;
  text-align: left;
}
.resume-doc.cover-mode .cover-closing { font-size: 11px; line-height: 1.5; color: #111; margin-top: 4px; }
.resume-doc.cover-mode.theme-classic .cover-para { font-family: 'IBM Plex Serif', serif; }
.resume-doc.cover-mode.theme-compact .cover-para { font-size: 10.5px; line-height: 1.55; }
`;
