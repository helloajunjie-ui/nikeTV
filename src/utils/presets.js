/**
 * 预设源配置
 * 统一管理所有预设源列表，避免 ImportSheet.vue 和 App.vue 重复定义
 *
 * iptv-org 分类源说明：
 *   gh-pages 路径 = GitHub Pages CDN，比 raw.githubusercontent.com 更快更稳定
 *   分类源（news/sports/entertainment/movies 等）每个包含数百频道
 */
export const presets = [
  // ── vbskycn/iptv ──
  { group: 'vbskycn/iptv', label: '📡 IPv4', url: 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u' },
  { group: 'vbskycn/iptv', label: '📡 IPv6', url: 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv6.m3u' },

  // ── iptv-org/iptv ──
  { group: 'iptv-org/iptv', label: '🇨🇳 CCTV', url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn_cctv.m3u' },
  { group: 'iptv-org/iptv', label: '🇨🇳 中国频道', url: 'https://iptv-org.github.io/iptv/countries/cn.m3u' },
  { group: 'iptv-org/iptv', label: '🀄 中文频道', url: 'https://iptv-org.github.io/iptv/languages/zho.m3u' },
  { group: 'iptv-org/iptv', label: '🌍 全球频道', url: 'https://iptv-org.github.io/iptv/index.m3u' },
  { group: 'iptv-org/iptv', label: '📰 新闻', url: 'https://iptv-org.github.io/iptv/categories/news.m3u' },
  { group: 'iptv-org/iptv', label: '⚽ 体育', url: 'https://iptv-org.github.io/iptv/categories/sports.m3u' },
  { group: 'iptv-org/iptv', label: '🎬 娱乐', url: 'https://iptv-org.github.io/iptv/categories/entertainment.m3u' },
  { group: 'iptv-org/iptv', label: '🎥 电影', url: 'https://iptv-org.github.io/iptv/categories/movies.m3u' },
  { group: 'iptv-org/iptv', label: '🎶 音乐', url: 'https://iptv-org.github.io/iptv/categories/music.m3u' },
  { group: 'iptv-org/iptv', label: '🧒 儿童', url: 'https://iptv-org.github.io/iptv/categories/kids.m3u' },
  { group: 'iptv-org/iptv', label: '📜 纪录片', url: 'https://iptv-org.github.io/iptv/categories/documentary.m3u' },
  { group: 'iptv-org/iptv', label: '🏛️ 教育', url: 'https://iptv-org.github.io/iptv/categories/education.m3u' },
  { group: 'iptv-org/iptv', label: '🔬 科技', url: 'https://iptv-org.github.io/iptv/categories/science.m3u' },

  // ── Free-TV/IPTV ──
  { group: 'Free-TV/IPTV', label: '🇨🇳 中国', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_china.m3u8' },

  // ── HerbertHe/iptv-sources ──
  { group: 'HerbertHe/iptv-sources', label: '🇨🇳 聚合', url: 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn.m3u' },
  { group: 'HerbertHe/iptv-sources', label: '🇨🇳 央视', url: 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_c.m3u' },
  { group: 'HerbertHe/iptv-sources', label: '🇨🇳 卫视', url: 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_p.m3u' },
]
