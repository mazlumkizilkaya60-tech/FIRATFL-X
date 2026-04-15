import { HomePage } from './pages/home-page.js';
import { PlayerPage } from './pages/player-page.js';

export class Router {
  constructor(container) {
    this.container = container;
    this.currentPage = null;
    this.routes = {
      '': () => this.showHome(),
      '#': () => this.showHome(),
      '#/': () => this.showHome(),
      '#/home': () => this.showHome(),
      '#/player/:mode/:id': (params) => this.showPlayer(params.mode, params.id)
    };

    this.init();
  }

  init() {
    window.addEventListener('hashchange', () => this.handleRoute());
    window.addEventListener('load', () => this.handleRoute());
  }

  handleRoute() {
    const hash = window.location.hash;
    const route = this.matchRoute(hash);

    if (route) {
      route.handler(route.params);
    } else {
      this.showHome();
    }
  }

  matchRoute(hash) {
    for (const [pattern, handler] of Object.entries(this.routes)) {
      const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, '([^/]+)') + '$');
      const match = hash.match(regex);

      if (match) {
        const paramNames = (pattern.match(/:(\w+)/g) || []).map(p => p.slice(1));
        const params = {};

        paramNames.forEach((name, index) => {
          params[name] = match[index + 1];
        });

        return { handler, params };
      }
    }
    return null;
  }

  showHome() {
    if (this.currentPage && this.currentPage.destroy) {
      this.currentPage.destroy();
    }

    this.currentPage = new HomePage(this.container);
    this.currentPage.load();
  }

  showPlayer(mode, id) {
    if (this.currentPage && this.currentPage.destroy) {
      this.currentPage.destroy();
    }

    this.currentPage = new PlayerPage(this.container);
    this.currentPage.load(mode, id);
  }

  navigate(path) {
    window.location.hash = path;
  }
}