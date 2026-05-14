const DB_NAME = "cert-gen-autosave";
const STORE = "state";
const KEY = "current";

export interface SavedPage {
  id: string;
  canvasJSON: string;
  bgColor: string;
  thumbnail: string;
}

export interface AutoSaveRecord {
  id: string;
  savedAt: number;
  canvasSize: { label: string; width: number; height: number };
  pages: SavedPage[];
  currentPageIdx: number;
  // Legacy single-page fields (for reading old records)
  canvasJSON?: string;
  bgColor?: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function autoSave(
  pages: SavedPage[],
  currentPageIdx: number,
  canvasSize: AutoSaveRecord["canvasSize"]
): Promise<void> {
  const db = await openDB();
  const record: AutoSaveRecord = { id: KEY, savedAt: Date.now(), canvasSize, pages, currentPageIdx };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadAutoSaved(): Promise<AutoSaveRecord | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as AutoSaveRecord) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function clearAutoSaved(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(KEY);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
