const DB_NAME = 'EchoTxt';
const DB_VERSION = 1;

export interface StoredBook {
  id: string;
  title: string;
  author: string;
  fileName: string;
  addedAt: number;
  spineColor: string;
}

export interface ReadingProgress {
  bookId: string;
  spread: number;
  fontSize: number;
  lastRead: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('books')) {
        db.createObjectStore('books', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('bookData')) {
        db.createObjectStore('bookData', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('progress')) {
        db.createObjectStore('progress', { keyPath: 'bookId' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const SPINE_COLORS = [
  '#6B3A2A', // sienna
  '#2A5C4A', // forest
  '#2A3D6B', // navy
  '#6B2A4A', // burgundy
  '#4A2A6B', // plum
  '#6B562A', // gold
  '#2A6B56', // teal
  '#6B3D2A', // rust
  '#3A2A6B', // indigo
  '#4A6B2A', // olive
];

export async function saveBook(
  file: File,
  title: string,
  author: string,
  colorIndex: number,
): Promise<StoredBook> {
  const db = await openDB();
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const data = await file.arrayBuffer();
  const spineColor = SPINE_COLORS[colorIndex % SPINE_COLORS.length];

  const book: StoredBook = {
    id,
    title,
    author,
    fileName: file.name,
    addedAt: Date.now(),
    spineColor,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(['books', 'bookData'], 'readwrite');
    tx.objectStore('books').put(book);
    tx.objectStore('bookData').put({ id, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });

  return book;
}

export async function getAllBooks(): Promise<StoredBook[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('books', 'readonly');
    const req = tx.objectStore('books').getAll();
    req.onsuccess = () =>
      resolve((req.result as StoredBook[]).sort((a, b) => a.addedAt - b.addedAt));
    req.onerror = () => reject(req.error);
  });
}

export async function getBookData(id: string): Promise<ArrayBuffer> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('bookData', 'readonly');
    const req = tx.objectStore('bookData').get(id);
    req.onsuccess = () => resolve((req.result as { id: string; data: ArrayBuffer }).data);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBook(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['books', 'bookData', 'progress'], 'readwrite');
    tx.objectStore('books').delete(id);
    tx.objectStore('bookData').delete(id);
    tx.objectStore('progress').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function saveProgress(
  bookId: string,
  spread: number,
  fontSize: number,
): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('progress', 'readwrite');
    tx.objectStore('progress').put({ bookId, spread, fontSize, lastRead: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getProgress(bookId: string): Promise<ReadingProgress | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('progress', 'readonly');
    const req = tx.objectStore('progress').get(bookId);
    req.onsuccess = () => resolve((req.result as ReadingProgress) ?? null);
    req.onerror = () => reject(req.error);
  });
}
