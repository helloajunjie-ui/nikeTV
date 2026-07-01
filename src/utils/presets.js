/**
 * 预设源配置
 * 统一管理所有预设源列表，避免 ImportSheet.vue 和 App.vue 重复定义
 *
 * iptv-org 分类源说明：
 *   gh-pages 路径 = GitHub Pages CDN，比 raw.githubusercontent.com 更快更稳定
 *   分类源（news/sports/entertainment/movies 等）每个包含数百频道
 */
export const presets = [
  // ── 本地精选源（zbds.top 聚合，375 频道，已清理非直播内容） ──
  { group: '本地精选', label: '🇨🇳 央视·卫视·地方 聚合', url: '/iptv4.m3u' },

  // ── fwc 世界杯/央视 4K 源 ──
  { group: 'fwc 世界杯', label: '🏆 世界杯·央视 4K', url: 'http://82.156.243.185:33389/fwc.m3u' },

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

  // ── inkss 精选源 ──
  { group: 'inkss/精选', label: '📡 IPv4 精选', url: 'https://gist.githubusercontent.com/inkss/0cf33e9f52fbb1f91bc5eb0144e504cf/raw/ipv4.m3u' },
  { group: 'inkss/精选', label: '📡 IPv6 精选', url: 'https://gist.githubusercontent.com/inkss/0cf33e9f52fbb1f91bc5eb0144e504cf/raw/ipv6.m3u' },

  // ── 上游聚合源（inkss 附录推荐） ──
  { group: '上游聚合', label: '📡 YanG-1989 聚合', url: 'https://raw.githubusercontent.com/YanG-1989/m3u/main/Gather.m3u' },
  { group: '上游聚合', label: '📡 fanmingming IPv6', url: 'https://raw.githubusercontent.com/fanmingming/live/main/tv/m3u/ipv6.m3u' },
  { group: '上游聚合', label: '📡 YueChan Live', url: 'https://raw.githubusercontent.com/YueChan/Live/main/IPTV.m3u' },
  { group: '上游聚合', label: '📡 drangjchen IPv6', url: 'https://raw.githubusercontent.com/drangjchen/IPTV/main/M3U/ipv6.m3u' },
  { group: '上游聚合', label: '📡 Kimentanm aptv', url: 'https://raw.githubusercontent.com/Kimentanm/aptv/master/m3u/iptv.m3u' },
  { group: '上游聚合', label: '📡 liu673cn box IPv6', url: 'https://raw.githubusercontent.com/liu673cn/box/main/libs/tv/ipv6.m3u' },
  { group: '上游聚合', label: '📡 mzky/itvlist', url: 'https://raw.githubusercontent.com/mzky/checklist/refs/heads/master/itvlist.m3u' },
  { group: '上游聚合', label: '📡 suxuang IPv4', url: 'https://raw.githubusercontent.com/suxuang/myIPTV/main/ipv4.m3u' },
  { group: '上游聚合', label: '📡 Jsnzkpg 聚合', url: 'https://raw.githubusercontent.com/Jsnzkpg/Jsnzkpg/Jsnzkpg/Jsnzkpg1.m3u' },

  // ── APTV 推荐源 ──
  { group: 'APTV 推荐', label: '🎮 虎牙直播', url: 'https://cdn.jsdelivr.net/gh/Kimentanm/aptv@master/m3u/ya.m3u' },
  { group: 'APTV 推荐', label: '🎮 虎牙一起看', url: 'https://cdn.jsdelivr.net/gh/Kimentanm/aptv@refs/heads/master/m3u/yqk.m3u' },
  { group: 'APTV 推荐', label: '📻 广播电台', url: 'https://cdn.jsdelivr.net/gh/Kimentanm/aptv@master/m3u/radio.m3u' },
]
