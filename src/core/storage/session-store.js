export function createSessionStore(namespace = 'app') {
  const prefix = `${namespace}:`;

  return {
    read(key, fallback = null) {
      try {
        const raw = sessionStorage.getItem(prefix + key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        console.warn('sessionStore read hatası:', error);
        return fallback;
      }
    },

    write(key, value) {
      try {
        sessionStorage.setItem(prefix + key, JSON.stringify(value));
        return true;
      } catch (error) {
        console.warn('sessionStore write hatası:', error);
        return false;
      }
    },

    remove(key) {
      try {
        sessionStorage.removeItem(prefix + key);
        return true;
      } catch (error) {
        console.warn('sessionStore remove hatası:', error);
        return false;
      }
    },

    clear() {
      try {
        const keys = [];
        for (let i = 0; i < sessionStorage.length; i += 1) {
          const key = sessionStorage.key(i);
          if (key && key.startsWith(prefix)) keys.push(key);
        }
        keys.forEach((key) => sessionStorage.removeItem(key));
        return true;
      } catch (error) {
        console.warn('sessionStore clear hatası:', error);
        return false;
      }
    }
  };
}
