import { useState, useEffect, useCallback, useMemo, useSyncExternalStore } from 'react';
import { prepareWithSegments, layoutWithLines } from '@chenglou/pretext';
import type { EpubContent, EpubParagraph } from './epubParser';

// ── Padding constants — must stay in sync with CSS .page-content padding ─────
const PADDING_H   = 50;  // px on each side
const PADDING_TOP = 55;
const PADDING_BOT = 32;
const PAGE_NUM_H  = 42;  // height of .page-number area

// ── Window size via useSyncExternalStore (no setState-in-effect needed) ───────

// Module-level cache so the snapshot returns a stable reference when unchanged
let _cachedSize = { width: window.innerWidth, height: window.innerHeight };
function getWindowSize() {
  const w = window.innerWidth, h = window.innerHeight;
  if (w !== _cachedSize.width || h !== _cachedSize.height) _cachedSize = { width: w, height: h };
  return _cachedSize;
}
function subscribeResize(notify: () => void) {
  window.addEventListener('resize', notify);
  return () => window.removeEventListener('resize', notify);
}

// ── Layout dimensions ─────────────────────────────────────────────────────────

interface Dims {
  fontSize:     number;
  pageWidth:    number;
  pageHeight:   number;
  contentWidth: number;
  lineHeight:   number;
  linesPerPage: number;
}

function computeDims(fontSize: number, vw: number, vh: number): Dims {
  // Each page ~44 % of viewport width; two pages fill ~88 % of the screen
  const pageWidth  = Math.min(600, Math.max(380, Math.floor(vw * 0.44)));
  const pageHeight = Math.min(800, Math.max(500, Math.floor(vh * 0.85)));
  const contentWidth  = pageWidth - PADDING_H * 2;
  const contentHeight = pageHeight - PADDING_TOP - PADDING_BOT - PAGE_NUM_H;
  const lineHeight    = Math.round(fontSize * 1.65);
  const linesPerPage  = Math.floor(contentHeight / lineHeight);
  return { fontSize, pageWidth, pageHeight, contentWidth, lineHeight, linesPerPage };
}

// ── Page item types ───────────────────────────────────────────────────────────

type PageItem =
  | { kind: 'heading'; text: string }
  | { kind: 'line';    text: string; isLastLine: boolean };

interface PageData { items: PageItem[] }

// ── Pagination — Pretext supplies exact line breaks ───────────────────────────

function paginate(paragraphs: EpubParagraph[], dims: Dims): PageData[] {
  const { fontSize, contentWidth, lineHeight, linesPerPage } = dims;
  const font = `${fontSize}px Georgia, serif`;

  const pages: PageData[] = [];
  let current: PageItem[] = [];
  let used = 0;

  function flush() {
    if (current.length) { pages.push({ items: current }); current = []; used = 0; }
  }

  for (const para of paragraphs) {
    if (para.type === 'heading') {
      if (used + 3 > linesPerPage) flush();
      current.push({ kind: 'heading', text: para.text });
      used += 3;
      continue;
    }

    // Ask Pretext for exact line texts at the current content width
    let lines: string[];
    try {
      const prepared = prepareWithSegments(para.text, font);
      lines = layoutWithLines(prepared, contentWidth, lineHeight).lines.map(l => l.text);
    } catch {
      // Fallback: rough character split
      const cpl = Math.max(1, Math.floor(contentWidth / (fontSize * 0.52)));
      lines = [];
      for (let i = 0; i < para.text.length; i += cpl) lines.push(para.text.slice(i, i + cpl));
    }
    if (!lines.length) continue;

    // Try to keep the whole paragraph on one page
    const slots = lines.length + 1; // +1 for the paragraph bottom gap
    if (used + slots > linesPerPage && current.length) flush();

    // Place line-by-line; split across pages only when paragraph > full page
    for (let i = 0; i < lines.length; i++) {
      if (used >= linesPerPage && current.length) flush();
      const isLastLine = i === lines.length - 1;
      current.push({ kind: 'line', text: lines[i], isLastLine });
      used += isLastLine ? 2 : 1; // last line consumes an extra slot for paragraph gap
    }
  }

  flush();
  return pages;
}

// ── BookPage ──────────────────────────────────────────────────────────────────

interface PageProps { page: PageData; pageNum: number; dims: Dims }

function BookPage({ page, pageNum, dims }: PageProps) {
  const { pageWidth, pageHeight, lineHeight, fontSize } = dims;
  const headingSize = Math.round(fontSize * 1.15);

  return (
    <div className="book-page" style={{ width: pageWidth, minHeight: pageHeight }}>
      <div className="page-content">
        {page.items.map((item, i) =>
          item.kind === 'heading' ? (
            <div
              key={i}
              className="book-heading"
              style={{ fontSize: headingSize, lineHeight: `${Math.round(headingSize * 1.4)}px` }}
            >
              {item.text}
            </div>
          ) : (
            <div
              key={i}
              className="book-line"
              style={{
                fontSize,
                lineHeight: `${lineHeight}px`,
                marginBottom: item.isLastLine ? 14 : 0,
              }}
            >
              {/* Non-breaking space keeps blank lines from collapsing */}
              {item.text || '\u00A0'}
            </div>
          )
        )}
      </div>
      <div className="page-number">{pageNum}</div>
    </div>
  );
}

// ── BookReader ────────────────────────────────────────────────────────────────

const MIN_FONT = 13;
const MAX_FONT = 24;

interface Props { epub: EpubContent; onClose: () => void }

export function BookReader({ epub, onClose }: Props) {
  const [pages,     setPages]     = useState<PageData[]>([]);
  const [computing, setComputing] = useState(true);
  const [spread,    setSpread]    = useState(0);
  const [fontSize,  setFontSize]  = useState(17);

  // Window dimensions — no setState-in-effect needed
  const windowSize = useSyncExternalStore(subscribeResize, getWindowSize);

  // Stable dims object; only recomputes when fontSize or window size actually changes
  const dims = useMemo(
    () => computeDims(fontSize, windowSize.width, windowSize.height),
    [fontSize, windowSize.width, windowSize.height]
  );

  // Re-paginate whenever the book or layout dims change.
  // All state updates happen inside the async callback — no synchronous setState in the effect body.
  useEffect(() => {
    const id = setTimeout(() => {
      setPages(paginate(epub.paragraphs, dims));
      setSpread(0);
      setComputing(false);
    }, 0);
    return () => clearTimeout(id);
  }, [epub, dims]);

  const totalPages = pages.length;
  const maxSpread  = Math.max(0, totalPages % 2 === 0 ? totalPages - 2 : totalPages - 1);

  const prevSpread = useCallback(() => setSpread(s => Math.max(0, s - 2)), []);
  const nextSpread = useCallback(
    () => setSpread(s => Math.min(maxSpread, s + 2)),
    [maxSpread]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prevSpread();
      else if (e.key === 'ArrowRight') nextSpread();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prevSpread, nextSpread]);

  const leftPage      = pages[spread];
  const rightPage     = pages[spread + 1];
  const currentSpread = Math.floor(spread / 2) + 1;
  const totalSpreads  = Math.ceil(totalPages / 2);

  return (
    <div className="reader-container">
      <div className="reader-toolbar">
        <button className="close-btn" onClick={onClose}>← Library</button>
        <span className="book-title">{epub.title}</span>

        <div className="font-controls">
          <button
            className="font-btn"
            onClick={() => setFontSize(s => Math.max(MIN_FONT, s - 1))}
            disabled={fontSize <= MIN_FONT}
            title="Decrease text size"
          >
            A−
          </button>
          <span className="font-size-label">{fontSize}px</span>
          <button
            className="font-btn"
            onClick={() => setFontSize(s => Math.min(MAX_FONT, s + 1))}
            disabled={fontSize >= MAX_FONT}
            title="Increase text size"
          >
            A+
          </button>
        </div>

        <span className="spread-counter">
          {computing ? '…' : `${currentSpread} / ${totalSpreads}`}
        </span>
      </div>

      {computing ? (
        <div className="computing">Laying out pages…</div>
      ) : (
        <>
          <div className="book-spread">
            {leftPage  && <BookPage page={leftPage}  pageNum={spread + 1} dims={dims} />}
            {rightPage && <BookPage page={rightPage} pageNum={spread + 2} dims={dims} />}
          </div>
          <div className="nav-controls">
            <button className="nav-btn" onClick={prevSpread} disabled={spread === 0}>
              ← Previous
            </button>
            <button className="nav-btn" onClick={nextSpread} disabled={spread >= maxSpread}>
              Next →
            </button>
          </div>
        </>
      )}
    </div>
  );
}
