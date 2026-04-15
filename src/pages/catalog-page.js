import { createI18n } from '../core/i18n/translations.js';
import { renderMediaCard, renderContinueCard } from '../components/cards.js';
import { renderCategoryStrip } from '../components/category-strip.js';
import { renderEmptyState } from '../components/empty-state.js';

function filterByCategory(items, categories, activeCategory) {
  if (activeCategory === 'all') return items;
  const match = categories.find((category) => category.id === activeCategory);
  if (!match) return items;
  return items.filter((item) => String(item.categoryId || item.category) === String(match.id) || item.category === match.label);
}

export function renderCatalogPage({ state, library, kind, language = 'tr' }) {
  const t = createI18n(language);
  const items = kind === 'movies' ? library.movies : library.series;
  const categories = kind === 'movies' ? library.categories.movies : library.categories.series;
  const activeCategory = kind === 'movies' ? state.app.filters.moviesCategory : state.app.filters.seriesCategory;
  const filtered = filterByCategory(items, categories, activeCategory);
  const favorites = state.user.favorites[kind];
  const continueWatching = state.user.continueWatching.filter((entry) =>
    kind === 'movies' ? entry.kind === 'movie' : ['series', 'episode'].includes(entry.kind)
  );

  return `
    <section class="catalog-shell">
      <header class="catalog-shell__header">
        <div class="catalog-shell__meta">
          <div class="catalog-shell__count">${filtered.length}</div>
          <div>
            <div class="catalog-shell__eyebrow">${kind === 'movies' ? t('catalog_movies_eyebrow') : t('catalog_series_eyebrow')}</div>
            <div class="catalog-shell__title">${kind === 'movies' ? t('catalog_movies_title') : t('catalog_series_title')}</div>
          </div>
        </div>
        <div class="catalog-shell__hint">
          ${t('catalog_hint')}
        </div>
      </header>
      ${renderCategoryStrip({
        categories,
        active: activeCategory,
        action: kind === 'movies' ? 'filter-movies-category' : 'filter-series-category',
        language
      })}
      ${
        continueWatching.length
          ? `
            <section class="rail-section">
              <div class="section-head">
                <div>
                  <span class="section-head__eyebrow">${t('catalog_continue_eyebrow')}</span>
                  <h2>${t('catalog_continue_title')}</h2>
                </div>
              </div>
              <div class="poster-rail">
                ${continueWatching.map(renderContinueCard).join('')}
              </div>
            </section>
          `
          : ''
      }
      <section class="poster-grid">
        ${
          filtered.length
            ? filtered
                .map((item) =>
                  renderMediaCard(item, {
                    isFavorite: favorites.includes(item.id),
                    language
                  })
                )
                .join('')
            : renderEmptyState({
                eyebrow: t('catalog_empty_eyebrow'),
                title: t('catalog_empty_title'),
                description: t('catalog_empty_description')
              })
        }
      </section>
    </section>
  `;
}
