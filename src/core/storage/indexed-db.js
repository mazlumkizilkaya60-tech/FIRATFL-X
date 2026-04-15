import { createLogger } from '../utils/logger.js';

const logger = createLogger('indexed-db');

export function createKeyValueDatabase(name, storeName = 'cache') {
  let openPromise;

  function open() {
    if (openPromise) return openPromise;

    openPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(name, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
    }).catch((error) => {
      logger.warn('open failed', error);
      return null;
    });

    return openPromise;
  }

  async function withStore(mode, callback) {
    const database = await open();
    if (!database) return null;

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const store = transaction.objectStore(storeName);

      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => reject(transaction.error);
      callback(store, resolve, reject);
    }).catch((error) => {
      logger.warn('transaction failed', error);
      return null;
    });
  }

  return {
    async get(key) {
      return withStore('readonly', (store, resolve) => {
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ?? null);
      });
    },
    async set(key, value) {
      return withStore('readwrite', (store) => {
        store.put(value, key);
      });
    },
    async remove(key) {
      return withStore('readwrite', (store) => {
        store.delete(key);
      });
    },
    async clear() {
      return withStore('readwrite', (store) => {
        store.clear();
      });
    }
  };
}
