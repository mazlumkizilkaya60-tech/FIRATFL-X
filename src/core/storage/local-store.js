export function createLocalStore(namespace = 'app') {
  const prefix = `${namespace}:`;

  return {
    read(key, fallback = null) {
      try {
        const raw = localStorage.getItem(prefix + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        console.warn('localStore read hatası:', error);
        return fallback;
      }
    },

    write(key, value) {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn('localStore write hatası:', error);
        return false;
      }
    },

    remove(key) {
      try {
        localStorage.removeItem(prefix + key);
        return true;
      } catch (error) {
        console.warn('localStore remove hatası:', error);
        return false;
      }
    },

    clear() {
      try {
        const keys = [];
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i);
          if (key && key.startsWith(prefix)) keys.push(key);
        }
        keys.forEach((key) => localStorage.removeItem(key));
        return true;
      } catch (error) {
        console.warn('localStore clear hatası:', error);
        return false;
      }
    }
  };
}
