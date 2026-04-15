export function createEmptyLibrary() {
  return {
    status: 'idle',
    loadedAt: null,
    sourceLabel: 'Demo Library',
    sourceType: 'demo',
    diagnostics: null,
    featured: [],
    hero: null,
    categories: {
      movies: [],
      series: [],
      live: []
    },
    movies: [],
    series: [],
    live: [],
    lookup: {},
    searchIndex: []
  };
}

export const DEFAULT_PREFERENCES = {
  theme: 'aurora',
  language: 'tr',
  liveProfile: 'stable',
  autoplayPreview: true,
  compactCards: false,
  previewMuted: true,
  hideAdultContent: true
};

export const DEFAULT_USER_STATE = {
  favorites: {
    movies: [],
    series: [],
    live: []
  },
  continueWatching: [],
  recentChannels: [],
  lastSearches: []
};

export const DEFAULT_SOURCES_STATE = {
  list: [],
  activeSourceId: null,
  cacheStamp: null,
  diagnostics: null
};

export const DEFAULT_PLAYER_STATE = {
  controlsVisible: true,
  playbackRate: 1,
  muted: false,
  selectedAudioTrack: null
};

export function createInitialState({
  preferences = DEFAULT_PREFERENCES,
  user = DEFAULT_USER_STATE,
  sources = DEFAULT_SOURCES_STATE,
  player = DEFAULT_PLAYER_STATE
} = {}) {
  return {
    app: {
      ready: false,
      loading: true,
      route: {
        name: 'home',
        params: {},
        query: {}
      },
      clock: {
        dateLabel: '',
        timeLabel: ''
      },
      drawers: {
        left: false,
        right: false,
        search: false
      },
      utilityPanel: 'status',
      overlays: {
        channelDigits: '',
        channelDigitsVisible: false
      },
      filters: {
        liveCategory: 'all',
        liveCollection: 'all',
        moviesCategory: 'all',
        seriesCategory: 'all'
      },
      selectedLiveId: null,
      searchQuery: '',
      searchResults: [],
      lastHealthCheck: null,
      toast: null,
      error: null
    },
    preferences,
    user,
    sources,
    library: createEmptyLibrary(),
    player
  };
}
