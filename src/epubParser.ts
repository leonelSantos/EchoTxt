import JSZip from 'jszip';

export interface EpubParagraph {
  text: string;
  type: 'heading' | 'text';
}

export interface EpubContent {
  title: string;
  paragraphs: EpubParagraph[];
}

function findFile(zip: JSZip, path: string): JSZip.JSZipObject | null {
  return zip.file(path) ?? zip.file(path.replace(/^\//, ''));
}

function opfBaseDir(opfPath: string): string {
  const slash = opfPath.lastIndexOf('/');
  return slash >= 0 ? opfPath.substring(0, slash + 1) : '';
}

export async function parseEpub(file: File): Promise<EpubContent> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  // 1. Locate the OPF via META-INF/container.xml
  const containerFile = findFile(zip, 'META-INF/container.xml');
  if (!containerFile) throw new Error('Not a valid EPUB: missing META-INF/container.xml');

  const containerXml = await containerFile.async('text');
  const containerDoc = new DOMParser().parseFromString(containerXml, 'application/xml');
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) throw new Error('EPUB container.xml has no rootfile path');

  // 2. Parse the OPF
  const opfFile = findFile(zip, opfPath);
  if (!opfFile) throw new Error(`EPUB OPF not found at: ${opfPath}`);

  const opfXml = await opfFile.async('text');
  const opfDoc = new DOMParser().parseFromString(opfXml, 'application/xml');
  const dir = opfBaseDir(opfPath);

  // Book title — try Dublin Core namespace first, then plain <title>
  const dcTitleEl =
    Array.from(opfDoc.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/', 'title'))[0] ??
    opfDoc.querySelector('title');
  const title = dcTitleEl?.textContent?.trim() || file.name.replace(/\.epub$/i, '');

  // Build id → href manifest
  const manifest = new Map<string, string>();
  opfDoc.querySelectorAll('manifest item').forEach(el => {
    const id = el.getAttribute('id');
    const href = el.getAttribute('href');
    if (id && href) manifest.set(id, href);
  });

  // Spine reading order
  const spineRefs = Array.from(opfDoc.querySelectorAll('spine itemref'))
    .map(el => el.getAttribute('idref'))
    .filter((id): id is string => !!id);

  const paragraphs: EpubParagraph[] = [];

  for (const idref of spineRefs) {
    const href = manifest.get(idref);
    if (!href) continue;

    // Strip fragment identifiers and decode URI components
    const cleanHref = decodeURIComponent(href.split('#')[0]);
    const fullPath = dir + cleanHref;

    const spineFile = findFile(zip, fullPath);
    if (!spineFile) continue;

    const html = await spineFile.async('text');

    // Try XHTML first; fall back to HTML if the parser reports an error
    let doc = new DOMParser().parseFromString(html, 'application/xhtml+xml');
    if (doc.querySelector('parsererror')) {
      doc = new DOMParser().parseFromString(html, 'text/html');
    }

    extractContent(doc, paragraphs);
  }

  return { title, paragraphs };
}

function extractContent(doc: Document, out: EpubParagraph[]): void {
  const root = doc.body ?? doc.documentElement;
  const elements = root.querySelectorAll('h1, h2, h3, h4, p');

  elements.forEach(el => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text.length < 2) return;
    out.push({
      text,
      type: el.tagName.toLowerCase().startsWith('h') ? 'heading' : 'text',
    });
  });
}
