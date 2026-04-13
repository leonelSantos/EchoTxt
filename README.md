# EchoTxt

A clean, browser-based EPUB reader with a two-page spread layout and precise text rendering.

## Features

- **Drag-and-drop or file picker** — open any `.epub` file instantly
- **Two-page spread** — books display as facing pages, like a physical book
- **Precise line layout** — uses [@chenglou/pretext](https://github.com/chenglou/pretext) for exact character-level line breaking
- **Adjustable font size** — A− / A+ controls ranging from 13px to 24px
- **Keyboard navigation** — Arrow Left / Arrow Right to flip pages
- **Responsive sizing** — page dimensions adapt to the viewport

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:5173`, drop in an `.epub` file, and start reading.

## Build

```bash
npm run build
```

Output goes to `dist/`.

## Tech Stack

| Layer | Library |
|---|---|
| UI | React 19 + TypeScript |
| Bundler | Vite |
| Text layout | @chenglou/pretext |
| EPUB parsing | JSZip (custom OPF/spine parser) |

## How it works

`epubParser.ts` reads the EPUB zip, locates the OPF manifest, follows the spine reading order, and extracts headings and paragraphs as plain text. `BookReader.tsx` feeds those paragraphs through Pretext's `prepareWithSegments` + `layoutWithLines` to compute exact line breaks at the current font size and column width, then paginates the result into spreads.
