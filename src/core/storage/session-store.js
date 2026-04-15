import { createLogger } from '../utils/logger.js';

const logger = createLogger('session-store');

export function createSessionStore(namespace) {
  const prefix = `${namespace}:`;

  return {
    read(key, fallback) {
      try {
        const raw = window.sessionStorage.getItem(prefix + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        logger.warn('read failed', key, error);
        return fallback;
      }
    },
    write(key, value) {
      try {
        window.sessionStorage.setItem(prefix + key, JSON.stringify(value));
      } catch (error) {
        logger.warn('write failed', key, error);
      }
      return value;
    },
    remove(key) {
      try {
        window.sessionStorage.removeItem(prefix + key);
      } catch (error) {
        logger.warn('remove failed', key, error);
      }
    }
  };
}
