// Storage on the phone (IndexedDB). Two stores:
//   kv    - the whole app state as one object under key "state"
//   blobs - photos and voice notes, keyed by id

const NAME = 'sourdough-buddy';
let dbp;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const db = () => dbp || (dbp = open());

async function run(store, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    tx.oncomplete = () => resolve(req instanceof IDBRequest ? req.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const getState = () => run('kv', 'readonly', (s) => s.get('state'));
export const putState = (v) => run('kv', 'readwrite', (s) => s.put(v, 'state'));
export const putBlob = (id, blob) => run('blobs', 'readwrite', (s) => s.put(blob, id));
export const getBlob = (id) => run('blobs', 'readonly', (s) => s.get(id));
export const delBlob = (id) => run('blobs', 'readwrite', (s) => s.delete(id));
export const blobKeys = () => run('blobs', 'readonly', (s) => s.getAllKeys());
export const clearAll = async () => {
  await run('kv', 'readwrite', (s) => s.clear());
  await run('blobs', 'readwrite', (s) => s.clear());
};

// Ask iOS/Safari not to evict our data when storage is tight.
export async function askPersistent() {
  try {
    if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist();
  } catch (e) { /* not supported */ }
  return false;
}
