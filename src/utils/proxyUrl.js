/**
 * Worker 代理 URL 工具
 *
 * 仅用于 EPG XML 请求（CORS 跨域问题必须走 Worker 代理）
 * 视频流直接播放，不经过代理
 */

const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

// 构建时注入的 Worker 代理地址（由 vite.config.js 的 define 注入）
const PROXY_BASE = (typeof __PROXY_URL__ !== 'undefined' ? __PROXY_URL__ : '') || ''

/**
 * 通过 Worker 代理请求 URL（仅用于 EPG XML 等非视频资源）
 * 开发环境直接返回原 URL
 */
export function getProxyUrl(url) {
  if (!url) return url
  if (IS_DEV) return url
  if (!PROXY_BASE) return url
  if (url.startsWith(PROXY_BASE)) return url
  return `${PROXY_BASE}/?url=${encodeURIComponent(url)}`
}
