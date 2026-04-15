// Python xtream_service.py'yi JavaScript'e çevir
export class XtreamProvider {
  constructor(config) {
    this.config = config;
    this.baseUrl = config.baseUrl;
    this.username = config.username;
    this.password = config.password;
  }

  async getCategories() {
    try {
      const response = await fetch(`${this.baseUrl}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_categories`);
      const data = await response.json();
      return data.map(cat => ({
        id: cat.category_id,
        name: cat.category_name,
        type: 'live'
      }));
    } catch (error) {
      console.error('Xtream categories error:', error);
      return [];
    }
  }

  async getStreams(categoryId) {
    try {
      const response = await fetch(`${this.baseUrl}/player_api.php?username=${this.username}&password=${this.password}&action=get_live_streams&category_id=${categoryId}`);
      const data = await response.json();
      return data.map(stream => ({
        id: stream.stream_id,
        name: stream.name,
        logo: stream.stream_icon,
        url: `${this.baseUrl}/live/${this.username}/${this.password}/${stream.stream_id}.m3u8`,
        category: categoryId
      }));
    } catch (error) {
      console.error('Xtream streams error:', error);
      return [];
    }
  }

  async getStreamUrl(streamId) {
    return `${this.baseUrl}/live/${this.username}/${this.password}/${streamId}.m3u8`;
  }
}