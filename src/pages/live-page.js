import { createI18n } from '../core/i18n/translations.js';
import { renderCategoryStrip } from '../components/category-strip.js';
import { renderLiveRow } from '../components/cards.js';
import { renderLivePreviewPanel } from '../components/live-preview-panel.js';
import { renderEmptyState } from '../components/empty-state.js';

function filterLive(liveChannels, categories, state) {
  let items = liveChannels;

  if (state.app.filters.liveCategory !== 'all') {
    const activeCategory = categories.find((category) => category.id === state.app.filters.liveCategory);
    if (activeCategory) {
      items = items.filter(
        (item) => String(item.categoryId || item.category) === String(activeCategory.id) || item.category === activeCategory.label
      );
    }
  }

  if (state.app.filters.liveCollection === 'favorites') {
    items = items.filter((item) => state.user.favorites.live.includes(item.id));
  }

  if (state.app.filters.liveCollection === 'recent') {
    items = items.filter((item) => state.user.recentChannels.some((recent) => recent.id === item.id));
  }

  return items;
}

export function renderLivePage({ state, library, language = 'tr' }) {
  const t = createI18n(language);
  const items = filterLive(library.live, library.categories.live, state);
  const selected =
    items.find((item) => item.id === state.app.selectedLiveId) ||
    items[0] ||
    library.live[0] ||
    null;

  return `
    <section class="catalog-shell live-tv-shell">
      <div class="live-tv-shell__tools">
        <div class="live-tv-shell__filters">
          <button class="selector pill-btn ${state.app.filters.liveCollection === 'all' ? 'pill-btn--primary' : ''}" data-action="set-live-collection" data-value="all" data-focus-id="live-collection-all">${t('live_all_channels')}</button>
          <button class="selector pill-btn ${state.app.filters.liveCollection === 'favorites' ? 'pill-btn--primary' : ''}" data-action="set-live-collection" data-value="favorites" data-focus-id="live-collection-favorites">${t('live_favorites')}</button>
          <button class="selector pill-btn ${state.app.filters.liveCollection === 'recent' ? 'pill-btn--primary' : ''}" data-action="set-live-collection" data-value="recent" data-focus-id="live-collection-recent">${t('live_recent')}</button>
        </div>
        <div class="live-tv-shell__summary">${t('live_channels_count', { count: items.length })} • ${state.preferences.liveProfile === 'latency' ? t('live_summary_latency') : t('live_summary_stable')}</div>
      </div>
      ${renderCategoryStrip({
        categories: library.categories.live,
        active: state.app.filters.liveCategory,
        action: 'filter-live-category',
        language
      })}
      <div class="live-tv-shell__content">
        <section class="live-tv-list">
          ${
            items.length
              ? items
                  .map((channel) =>
                    renderLiveRow(channel, {
                      active: selected?.id === channel.id,
                      favorite: state.user.favorites.live.includes(channel.id),
                      language
                    })
                  )
                  .join('')
              : renderEmptyState({
                  eyebrow: t('live_empty_eyebrow'),
                  title: t('live_empty_title'),
                  description: t('live_empty_description')
                })
          }
        </section>
        ${renderLivePreviewPanel(selected, {
          muted: state.preferences.previewMuted,
          favorite: selected ? state.user.favorites.live.includes(selected.id) : false,
          language
        })}
      </div>
    </section>
  `;
}
