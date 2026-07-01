/**
 * 预设源配置
 * 统一管理所有预设源列表，避免 ImportSheet.vue 和 App.vue 重复定义
 */
export const presets = [
  { group: 'vbskycn/iptv', label: '📡 IPv4', url: 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv4.m3u' },
  { group: 'vbskycn/iptv', label: '📡 IPv6', url: 'https://raw.githubusercontent.com/vbskycn/iptv/master/tv/iptv6.m3u' },
  { group: 'iptv-org/iptv', label: '🇨🇳 CCTV', url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/cn_cctv.m3u' },
  { group: 'iptv-org/iptv', label: '🇨🇳 中国', url: 'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/countries/cn.m3u' },
  { group: 'iptv-org/iptv', label: '🌍 全球', url: 'https://raw.githubusercontent.com/iptv-org/iptv/gh-pages/index.m3u' },
  { group: 'Free-TV/IPTV', label: '🇨🇳 中国', url: 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlists/playlist_china.m3u8' },
  { group: 'HerbertHe/iptv-sources', label: '🇨🇳 聚合', url: 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn.m3u' },
  { group: 'HerbertHe/iptv-sources', label: '🇨🇳 央视', url: 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_c.m3u' },
  { group: 'HerbertHe/iptv-sources', label: '🇨🇳 卫视', url: 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn_p.m3u' },
]
