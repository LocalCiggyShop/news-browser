export const api = globalThis.browser || globalThis.chrome;
const DB_NAME = 'news-browser-v1';
let dbPromise;
export function database() {
  if (!dbPromise) dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache');
    };
    request.onsuccess = () => { request.result.onversionchange = () => { request.result.close(); dbPromise = undefined; }; resolve(request.result); };
    request.onerror = () => { dbPromise = undefined; reject(request.error); };
  });
  return dbPromise;
}
export async function readCache() {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readonly');
    const request = tx.objectStore('cache').get('feedData');
    request.onsuccess = () => resolve(request.result || { articles: [], health: {}, historySince: 0 });
    request.onerror = () => reject(request.error);
  });
}
export async function writeCache(cache) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('cache', 'readwrite');
    tx.objectStore('cache').put(cache, 'feedData');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Cache update was interrupted.'));
  });
}
