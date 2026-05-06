const DB_NAME = "cert-gen-db";
const DB_VERSION = 1;
const STORE = "templates";

export interface SavedTemplate {
  id: string;
  name: string;
  savedAt: number;
  thumbnail: string;
  canvasJSON: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("savedAt", "savedAt", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function listTemplates(): Promise<SavedTemplate[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).index("savedAt").getAll();
    req.onsuccess = () => resolve((req.result as SavedTemplate[]).reverse());
    req.onerror = () => reject(req.error);
  });
}

export async function saveTemplate(
  data: Omit<SavedTemplate, "id" | "savedAt">
): Promise<SavedTemplate> {
  const db = await openDB();
  const template: SavedTemplate = {
    ...data,
    id: Date.now().toString(36) + Math.random().toString(36).slice(2),
    savedAt: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).add(template);
    req.onsuccess = () => resolve(template);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTemplate(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const req = tx.objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}
