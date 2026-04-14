import { useState, useRef, useCallback, useEffect } from 'react';
import { parseEpub, type EpubContent } from './epubParser';
import { BookAnimation } from './BookAnimation';
import { BookReader } from './BookReader';
import {
  saveBook,
  getAllBooks,
  getBookData,
  deleteBook,
  getProgress,
  type StoredBook,
} from './db';
import './index.css';

interface InitialProgress {
  spread: number;
  fontSize: number;
}

export default function App() {
  const [epub, setEpub]                       = useState<EpubContent | null>(null);
  const [activeBookId, setActiveBookId]       = useState<string | undefined>(undefined);
  const [initialProgress, setInitialProgress] = useState<InitialProgress>({ spread: 0, fontSize: 17 });
  const [books, setBooks]                     = useState<StoredBook[]>([]);
  const [libraryLoaded, setLibraryLoaded]     = useState(false);
  const [loading, setLoading]                 = useState(false);
  const [loadingBookId, setLoadingBookId]     = useState<string | null>(null);
  const [error, setError]                     = useState<string | null>(null);
  const [dragging, setDragging]               = useState(false);
  const fileInputRef                          = useRef<HTMLInputElement>(null);

  // Load saved books on mount
  useEffect(() => {
    getAllBooks()
      .then(setBooks)
      .catch(() => {})
      .finally(() => setLibraryLoaded(true));
  }, []);

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
      const stored = await saveBook(file, content.title, content.author, books.length);
      setBooks(prev => [...prev, stored]);
      setActiveBookId(stored.id);
      setInitialProgress({ spread: 0, fontSize: 17 });
      setEpub(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to parse EPUB');
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [books.length]);

  const openStoredBook = useCallback(async (book: StoredBook) => {
    setLoadingBookId(book.id);
    setError(null);
    try {
      const [data, progress] = await Promise.all([
        getBookData(book.id),
        getProgress(book.id),
      ]);
      const file = new File([data], book.fileName, { type: 'application/epub+zip' });
      const content = await parseEpub(file);
      setActiveBookId(book.id);
      setInitialProgress({
        spread: progress?.spread ?? 0,
        fontSize: progress?.fontSize ?? 17,
      });
      setEpub(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open book');
    } finally {
      setLoadingBookId(null);
    }
  }, []);

  const handleDelete = useCallback(async (e: React.MouseEvent, bookId: string) => {
    e.stopPropagation();
    await deleteBook(bookId);
    setBooks(prev => prev.filter(b => b.id !== bookId));
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const fileInput = (
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
  );

  // ── Reader ────────────────────────────────────────────────────────────────
  if (epub) {
    return (
      <BookReader
        epub={epub}
        bookId={activeBookId}
        initialSpread={initialProgress.spread}
        initialFontSize={initialProgress.fontSize}
        onClose={() => { setEpub(null); setActiveBookId(undefined); }}
      />
    );
  }

  // ── Empty library: drop zone ──────────────────────────────────────────────
  if (!libraryLoaded || books.length === 0) {
    return (
      <div
        className={`drop-screen${dragging ? ' dragging' : ''}`}
        onDrop={onDrop}
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
      >
        <div className="drop-zone">
          <BookAnimation size="large" />
          <p>Drop an EPUB file here to start reading</p>
          <button onClick={() => fileInputRef.current?.click()} disabled={loading}>
            {loading ? 'Opening…' : 'Choose file'}
          </button>
          {fileInput}
          {error && <p className="error">{error}</p>}
        </div>
      </div>
    );
  }

  // ── Bookshelf ─────────────────────────────────────────────────────────────
  return (
    <div
      className={`bookshelf-screen${dragging ? ' bookshelf-screen--dragging' : ''}`}
      onDrop={onDrop}
      onDragOver={e => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
    >
      <div className="bookshelf-header">
        <h1 className="bookshelf-title">
          <BookAnimation size="small" />
        </h1>
      </div>
      {fileInput}
      {error && <p className="error bookshelf-error">{error}</p>}

      <div className="shelf-area">
        <div className="shelf-books">
          {books.map(book => (
            <div
              key={book.id}
              className={`book-spine-card${loadingBookId === book.id ? ' book-spine-card--loading' : ''}`}
              style={{ background: book.spineColor }}
              onClick={() => { if (!loadingBookId) openStoredBook(book); }}
              title={`${book.title}${book.author ? ` — ${book.author}` : ''}`}
            >
              <div className="spine-text">
                {/* author first in DOM so title appears at the top of the spine after rotation */}
                {book.author && <span className="spine-author">{book.author}</span>}
                <span className="spine-title">{book.title}</span>
              </div>
              <button
                className="spine-delete"
                onClick={e => handleDelete(e, book.id)}
                title="Remove from library"
                aria-label={`Remove ${book.title}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            className="add-book-spine"
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            title="Add a book"
          >
            <span className="add-book-spine-label">{loading ? 'Opening…' : 'Add book'}</span>
            <span className="add-book-spine-plus">+</span>
          </button>
        </div>
        <div className="shelf-plank" />
      </div>
    </div>
  );
}
