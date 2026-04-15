import { createI18n } from '../core/i18n/translations.js';
import { escapeHtml } from '../core/utils/dom.js';

export function renderCategoryStrip({
  categories = [],
  active = 'all',
  action = 'filter-category',
  includeAll = true,
  language = 'tr'
} = {}) {
  const t = createI18n(language);
  const chips = [];

  if (includeAll) {
    chips.push(`
      <button type="button" class="selector category-chip ${active === 'all' ? 'is-active' : ''}" data-action="${action}" data-value="all" data-focus-id="category-${action}-all">
        ${t('common_all')}
      </button>
    `);
  }

  categories.forEach((category) => {
    chips.push(`
      <button
        type="button"
        class="selector category-chip ${active === category.id ? 'is-active' : ''}"
        data-action="${action}"
        data-value="${escapeHtml(category.id)}"
        data-focus-id="category-${escapeHtml(action)}-${escapeHtml(category.id)}"
      >
        ${escapeHtml(category.label)}
      </button>
    `);
  });

  return `
    <div class="category-strip">
      <div class="category-strip__rail">
        ${chips.join('')}
      </div>
    </div>
  `;
}
