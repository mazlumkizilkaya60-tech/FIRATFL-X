const LOG_LEVELS = ['error', 'warn', 'info', 'debug'];

function resolveLevel() {
  try {
    const raw = window.localStorage.getItem('ffx.debug.level');
    if (LOG_LEVELS.includes(raw)) return raw;
  } catch (error) {
    return 'warn';
  }

  return 'warn';
}

export function createLogger(scope) {
  const activeLevel = resolveLevel();
  const activeIndex = LOG_LEVELS.indexOf(activeLevel);

  return {
    error: (...args) => {
      if (activeIndex >= 0) console.error(`[${scope}]`, ...args);
    },
    warn: (...args) => {
      if (activeIndex >= 1) console.warn(`[${scope}]`, ...args);
    },
    info: (...args) => {
      if (activeIndex >= 2) console.info(`[${scope}]`, ...args);
    },
    debug: (...args) => {
      if (activeIndex >= 3) console.debug(`[${scope}]`, ...args);
    }
  };
}
