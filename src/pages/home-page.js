// Python home page template'ini JavaScript'e çevir
import { getHomeData } from '../app.js';

export class HomePage {
  constructor(container) {
    this.container = container;
    this.data = null;
    this.isLoading = false;
  }

  async load() {
    if (this.isLoading) return;
    this.isLoading = true;

    this.showLoading();

    try {
      this.data = await getHomeData();
      this.render();
    } catch (error) {
      console.error('Error loading home page:', error);
      this.showError('Failed to load content. Please try again.');
    } finally {
      this.isLoading = false;
    }
  }

  showLoading() {
    this.container.innerHTML = '<div class="loading"><div class="loading-spinner"></div><p>Loading content...</p></div>';
  }

  showError(message) {
    this.container.innerHTML = '<div class="error"><h2>Error</h2><p>' + message + '</p><button onclick="location.reload()">Retry</button></div>';
  }

  render() {
    if (!this.data) return;

    const { hero_items, latest_movies, trending_movies, popular_series, live_channels } = this.data;

    this.container.innerHTML = '<div class="home-page">' +
      '<div class="hero-section">' + this.renderHero(hero_items) + '</div>' +
      '<div class="content-section">' +
        '<div class="category-section"><h2>Live Channels</h2><div class="content-grid">' + this.renderItems(live_channels, 'live') + '</div></div>' +
        '<div class="category-section"><h2>Latest Movies</h2><div class="content-grid">' + this.renderItems(latest_movies, 'movie') + '</div></div>' +
        '<div class="category-section"><h2>Trending Movies</h2><div class="content-grid">' + this.renderItems(trending_movies, 'movie') + '</div></div>' +
        '<div class="category-section"><h2>Popular Series</h2><div class="content-grid">' + this.renderItems(popular_series, 'series') + '</div></div>' +
      '</div>' +
    '</div>';

    this.attachEventListeners();
  }

  renderHero(items) {
    if (!items || items.length === 0) return '<div class="no-content">No hero content available</div>';

    const item = items[0];
    const image = item.poster || item.logo || '/images/placeholder.jpg';
    const title = item.name || item.title || 'Unknown';

    return '<div class="hero-item" data-id="' + item.id + '" data-mode="live">' +
      '<img src="' + image + '" alt="' + title + '" class="hero-image">' +
      '<div class="hero-overlay">' +
        '<h1>' + title + '</h1>' +
        '<button class="play-button">Play</button>' +
      '</div>' +
    '</div>';
  }

  renderItems(items, mode) {
    if (!items || items.length === 0) return '<div class="no-content">No content available</div>';

    return items.map(item => {
      const image = item.poster || item.logo || '/images/placeholder.jpg';
      const title = item.name || item.title || 'Unknown';

      return '<div class="content-item" data-id="' + item.id + '" data-mode="' + mode + '">' +
        '<img src="' + image + '" alt="' + title + '" loading="lazy">' +
        '<h3>' + title + '</h3>' +
      '</div>';
    }).join('');
  }

  attachEventListeners() {
    // Hero play button
    const heroPlayBtn = this.container.querySelector('.play-button');
    if (heroPlayBtn) {
      heroPlayBtn.addEventListener('click', (e) => {
        const heroItem = e.target.closest('.hero-item');
        if (heroItem) {
          const id = heroItem.dataset.id;
          const mode = heroItem.dataset.mode;
          this.playItem(id, mode);
        }
      });
    }

    // Content items
    const contentItems = this.container.querySelectorAll('.content-item');
    contentItems.forEach(item => {
      item.addEventListener('click', (e) => {
        const id = item.dataset.id;
        const mode = item.dataset.mode;
        this.playItem(id, mode);
      });
    });
  }

  playItem(id, mode) {
    // Navigate to player page
    window.location.hash = '#/player/' + mode + '/' + id;
  }
}
