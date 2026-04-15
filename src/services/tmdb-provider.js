// Python tmdb_service.py'yi JavaScript'e çevir
export class TMDBProvider {
  constructor(config) {
    this.config = config;
    this.apiKey = config.apiKey;
    this.baseUrl = 'https://api.themoviedb.org/3';
    this.imageBaseUrl = 'https://image.tmdb.org/t/p/w500';
  }

  async getPopularMovies() {
    try {
      const response = await fetch(`${this.baseUrl}/movie/popular?api_key=${this.apiKey}&language=tr-TR`);
      const data = await response.json();
      return data.results.map(movie => ({
        id: movie.id,
        title: movie.title,
        poster: movie.poster_path ? `${this.imageBaseUrl}${movie.poster_path}` : null,
        backdrop: movie.backdrop_path ? `${this.imageBaseUrl}${movie.backdrop_path}` : null,
        overview: movie.overview,
        releaseDate: movie.release_date,
        rating: movie.vote_average,
        type: 'movie'
      }));
    } catch (error) {
      console.error('TMDB movies error:', error);
      return [];
    }
  }

  async getPopularSeries() {
    try {
      const response = await fetch(`${this.baseUrl}/tv/popular?api_key=${this.apiKey}&language=tr-TR`);
      const data = await response.json();
      return data.results.map(series => ({
        id: series.id,
        name: series.name,
        poster: series.poster_path ? `${this.imageBaseUrl}${series.poster_path}` : null,
        backdrop: series.backdrop_path ? `${this.imageBaseUrl}${series.backdrop_path}` : null,
        overview: series.overview,
        firstAirDate: series.first_air_date,
        rating: series.vote_average,
        type: 'series'
      }));
    } catch (error) {
      console.error('TMDB series error:', error);
      return [];
    }
  }

  async search(query, type = 'multi') {
    try {
      const response = await fetch(`${this.baseUrl}/search/${type}?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&language=tr-TR`);
      const data = await response.json();
      return data.results.map(item => ({
        id: item.id,
        title: item.title || item.name,
        poster: item.poster_path ? `${this.imageBaseUrl}${item.poster_path}` : null,
        overview: item.overview,
        releaseDate: item.release_date || item.first_air_date,
        rating: item.vote_average,
        type: item.media_type || type
      }));
    } catch (error) {
      console.error('TMDB search error:', error);
      return [];
    }
  }
}