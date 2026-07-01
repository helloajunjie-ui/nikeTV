/**
 * CORS 代理 URL 工具
 *
 * 策略（极简版）：
 *   所有直播流 URL 统统走 Cloudflare Worker 代理
 *   无论 HTTP 还是 HTTPS，彻底解决 Mixed Content 和 CORS 问题
 *
 * 为什么去掉公共代理：
 *   公共代理（corsproxy.io / allorigins.win）不支持流媒体传输
 *   它们会掐断长连接，导致播放失败
 *   自建 Worker 足够可靠，不需要花哨的降级逻辑
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
  // 开发环境：Vite 是 HTTP 服务器，无 Mixed Content 问题
  if (IS_DEV) return url
  // 如果没有配置 Worker，直接返回原 URL
  if (!PROXY_BASE) return url

  // 如果已经是 Worker 代理 URL，直接返回
  if (url.startsWith(PROXY_BASE)) return url

  // 统统走 Worker 代理
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

/**
 * 强制检测 Worker 健康状态
 * 返回 Promise<boolean>
 */
export async function checkWorkerHealth() {
  if (!PROXY_BASE) return false
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(`${PROXY_BASE}/health`, {
      signal: controller.signal,
      cache: 'no-cache',
      mode: 'cors',
    })
    clearTimeout(timeout)
    return res.ok
  } catch {
    return false
  }
}

/**
 * 标记 Worker 不可用（保留接口，但不再触发降级到第三方代理）
 */
export function markWorkerDead() {
  console.warn('[proxy] Worker 代理请求失败')
}

/**
 * 重置 Worker 健康状态
 */
export function resetWorkerHealth() {
  // 无操作，因为不再维护复杂状态
}
