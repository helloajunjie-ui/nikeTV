/**
 * CORS 代理 URL 工具
 *
 * 策略（绝对纯净版）：
 *   所有直播流 URL 统统走 Cloudflare Worker 代理
 *   无论 HTTP 还是 HTTPS，彻底解决 Mixed Content 和 CORS 问题
 *   没有任何降级逻辑，没有任何第三方代理
 */

const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

// 构建时注入的 Worker 代理地址（由 vite.config.js 的 define 注入）
const PROXY_BASE = (typeof __PROXY_URL__ !== 'undefined' ? __PROXY_URL__ : '') || ''

/**
 * 对直播流 URL 进行代理包装
 * 开发环境直接返回原 URL
 * 生产环境：所有流都走 Worker 代理
 */
export function getProxiedUrl(url) {
  if (!url) return url
  if (IS_DEV) return url
  if (!PROXY_BASE) return url
  if (url.startsWith(PROXY_BASE)) return url
  return `${PROXY_BASE}/?url=${encodeURIComponent(url)}`
}

/**
 * 批量代理频道列表中的 URL
 */
export function proxyChannelList(channels) {
  return channels.map(ch => ({
    ...ch,
    urls: ch.urls ? ch.urls.map(u => ({
      ...u,
      url: getProxiedUrl(u.url),
    })) : ch.urls,
  }))
}
