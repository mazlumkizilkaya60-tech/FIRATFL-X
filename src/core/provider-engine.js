// Python versiyonundaki provider_engine.py'yi JavaScript'e çevir
import { XtreamProvider } from '../services/xtream-provider.js';
import { TMDBProvider } from '../services/tmdb-provider.js';

export class ProviderEngine {
  constructor() {
    this.providers = {};
    this._initialized = false;
  }

  async initialize(config) {
    if (this._initialized) return;

    // Xtream provider
    if (config.xtream) {
      this.register('xtream', new XtreamProvider(config.xtream));
    }

    // TMDB provider
    if (config.tmdb) {
      this.register('tmdb', new TMDBProvider(config.tmdb));
    }

    this._initialized = true;
  }

  register(name, provider) {
    this.providers[name] = provider;
  }

  get(name) {
    return this.providers[name];
  }

  names() {
    return Object.keys(this.providers);
  }

  clear() {
    this.providers = {};
    this._initialized = false;
  }
}

// Global provider engine instance
export const providers = new ProviderEngine();