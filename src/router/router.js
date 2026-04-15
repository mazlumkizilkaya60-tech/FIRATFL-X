import { buildRoute, matchRoute } from './routes.js';

function parseHash(hash = window.location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [pathname = '', search = ''] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(search));
  const matched = matchRoute(pathname);

  return {
    ...matched,
    query,
    pathname
  };
}

export class Router {
  constructor() {
    this.listeners = new Set();
    this.handleChange = this.handleChange.bind(this);
  }

  start() {
    window.addEventListener('hashchange', this.handleChange);
    if (!window.location.hash) {
      window.location.hash = '#/';
    } else {
      this.handleChange();
    }
  }

  stop() {
    window.removeEventListener('hashchange', this.handleChange);
  }

  handleChange() {
    const route = parseHash();
    this.listeners.forEach((listener) => listener(route));
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  navigate(name, params = {}, query = {}) {
    window.location.hash = buildRoute(name, params, query);
  }

  resolve() {
    return parseHash();
  }
}
