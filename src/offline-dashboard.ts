export type OfflineSnapshot<T> = { data: T; savedAt: string };

const DATABASE = "magic-folio-private-cache";
const STORE = "snapshots";
const KEY = "dashboard";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("Offline storage is unavailable in this browser."));
      return;
    }
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open offline storage."));
  });
}

export async function saveDashboardSnapshot<T>(data: T): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE, "readwrite");
    transaction.objectStore(STORE).put({ data, savedAt: new Date().toISOString() }, KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Unable to save offline dashboard."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline dashboard save was cancelled."));
  }).finally(() => database.close());
}

export async function readDashboardSnapshot<T>(): Promise<OfflineSnapshot<T> | null> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE, "readonly");
    const request = transaction.objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("Unable to read offline dashboard."));
    transaction.oncomplete = () => database.close();
    transaction.onerror = () => database.close();
  });
}

export async function clearDashboardSnapshot(): Promise<void> {
  try {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE, "readwrite");
      transaction.objectStore(STORE).delete(KEY);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error || new Error("Unable to clear offline dashboard."));
      transaction.onabort = () => reject(transaction.error || new Error("Offline dashboard clear was cancelled."));
    }).finally(() => database.close());
  } catch {
    // Offline storage is optional. A browser without IndexedDB has nothing to clear.
  }
}
