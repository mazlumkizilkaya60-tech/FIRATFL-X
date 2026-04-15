export const routes = [
  { name: 'home', pattern: '' },
  { name: 'home', pattern: 'home' },
  { name: 'movies', pattern: 'movies' },
  { name: 'series', pattern: 'series' },
  { name: 'live', pattern: 'live' },
  { name: 'detail', pattern: 'detail/:kind/:id' },
  { name: 'player', pattern: 'player/:kind/:id' }
];

function tokenize(pattern = '') {
  return pattern.split('/').filter(Boolean);
}

export function matchRoute(pathname = '') {
  const segments = tokenize(pathname);

  for (const route of routes) {
    const patternSegments = tokenize(route.pattern);
    if (segments.length !== patternSegments.length) continue;

    const params = {};
    let matched = true;

    patternSegments.forEach((segment, index) => {
      if (!matched) return;
      const value = segments[index];

      if (segment.startsWith(':')) {
        params[segment.slice(1)] = decodeURIComponent(value);
        return;
      }

      if (segment !== value) {
        matched = false;
      }
    });

    if (matched) {
      return {
        name: route.name,
        params
      };
    }
  }

  return {
    name: 'home',
    params: {}
  };
}

export function buildRoute(name, params = {}, query = {}) {
  const route = routes.find((item) => item.name === name) ?? routes[0];
  const path = tokenize(route.pattern)
    .map((segment) => (segment.startsWith(':') ? encodeURIComponent(params[segment.slice(1)] ?? '') : segment))
    .filter(Boolean)
    .join('/');

  const search = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value != null && value !== '')
  ).toString();

  if (!path && !search) return '#/';
  if (!search) return `#/${path}`;
  return `#/${path}?${search}`;
}
