import { createI18n } from '../core/i18n/translations.js';
import { renderPlayerUi } from '../components/player-ui.js';

export function renderPlayerPage({ item, related, language = 'tr' }) {
  const t = createI18n(language);

  if (!item) {
    return `<section class="empty-state"><span>${t('player_missing_eyebrow')}</span><h3>${t('player_missing_title')}</h3><p>${t('player_missing_description')}</p></section>`;
  }

  return renderPlayerUi(item, related, language);
}
