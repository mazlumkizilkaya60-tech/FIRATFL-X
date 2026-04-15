import { createLogger } from '../utils/logger.js';

const logger = createLogger('local-store');

export function createLocalStore(namespace) {
  const prefix = `${namespace}:`;

  function read(key, fallback) {
    try {
      const raw = window.localStorage.getItem(prefix + key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      logger.warn('read failed', key, error);
      return fallback;
    }
  }

  function write(key, value) {
    try {
      window.localStorage.setItem(prefix + key, JSON.stringify(value));
      return value;
    } catch (error) {
      logger.warn('write failed', key, error);
      return value;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(prefix + key);
    } catch (error) {
      logger.warn('remove failed', key, error);
    }
  }

  function clear() {
    try {
      Object.keys(window.localStorage)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => window.localStorage.removeItem(key));
    } catch (error) {
      logger.warn('clear failed', error);
    }
  }

  return {
    read,
    write,
    remove,
    clear
  };
}
