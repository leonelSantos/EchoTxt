import { useState, useRef, useCallback } from 'react';
import { parseEpub, type EpubContent } from './epubParser';
import { BookReader } from './BookReader';
import './index.css';

export default function App() {
  const [epub, setEpub] = useState<EpubContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.epub')) {
      setError('Please choose an .epub file');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const content = await parseEpub(file);
      if (content.paragraphs.length === 0) {
        setError('No readable text found in this EPUB');
        return;
      }
      setEpub(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse EPUB');
    } finally {
      setLoading(false);
      // Reset so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (epub) {
    return <BookReader epub={epub} onClose={() => setEpub(null)} />;
  }

  return (
    <div
      className={`drop-screen${dragging ? ' dragging' : ''}`}
      onDrop={onDrop}
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
    >
      <div className="drop-zone">
        <span className="book-icon">📖</span>
        <h1>EchoTxt</h1>
        <p>Drop an EPUB file here to start reading</p>
        <button onClick={() => fileInputRef.current?.click()} disabled={loading}>
          {loading ? 'Opening…' : 'Choose file'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}
