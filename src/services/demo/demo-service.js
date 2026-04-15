import { groupBy } from '../../core/utils/collections.js';

function createProgramme(title, start, durationMinutes) {
  return {
    title,
    description: `${title} yayını`,
    start,
    stop: new Date(start.getTime() + durationMinutes * 60 * 1000)
  };
}

function hydrateLivePrograms(channels = []) {
  const now = new Date();
  const base = new Date(now);
  base.setMinutes(Math.floor(base.getMinutes() / 30) * 30, 0, 0);

  return channels.map((channel, index) => {
    const seed = channel.scheduleSeed ?? ['Live Flow', 'Afterglow'];
    const nowProgram = createProgramme(seed[0], new Date(base.getTime() - 15 * 60 * 1000), 60 + index * 4);
    const nextProgram = createProgramme(seed[1] ?? seed[0], nowProgram.stop, 60);
    return {
      ...channel,
      kind: 'live',
      category: channel.group,
      poster: channel.logo,
      logo: channel.logo,
      nowProgram,
      nextProgram,
      progress: Math.min(96, Math.max(14, ((now - nowProgram.start) / (nowProgram.stop - nowProgram.start)) * 100))
    };
  });
}

function createCategories(items = [], field = 'category') {
  return Object.keys(groupBy(items, (item) => item[field] || 'General'))
    .sort((left, right) => left.localeCompare(right, 'tr'))
    .map((label) => ({
      id: label.toLocaleLowerCase('tr-TR').replaceAll(/\s+/g, '-'),
      label
    }));
}

export async function loadDemoLibrary() {
  const response = await fetch('./demo/library.json');
  if (!response.ok) {
    throw new Error('Demo katalogu yüklenemedi.');
  }

  const payload = await response.json();
  const live = hydrateLivePrograms(payload.live ?? []);
  const movies = (payload.movies ?? []).map((movie) => ({ ...movie, kind: 'movie' }));
  const series = (payload.series ?? []).map((show) => ({ ...show, kind: 'series' }));

  return {
    sourceType: 'demo',
    sourceLabel: 'FIRATFLIX Demo',
    hero: payload.hero,
    featured: [...movies.slice(0, 3), ...series.slice(0, 2)],
    categories: {
      movies: createCategories(movies),
      series: createCategories(series),
      live: createCategories(live)
    },
    movies,
    series,
    live
  };
}
