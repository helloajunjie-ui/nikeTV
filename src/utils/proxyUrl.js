/**
 * CORS 代理 URL 工具
 *
 * 策略（三级降级）：
 *   1. HTTPS 流 → 直连（无需代理）
 *   2. HTTP 流 → Cloudflare Worker 代理（生产环境）
 *   3. Worker 不可用 → 直连（降级，部分源可能因 Mixed Content 失败）
 *
 * 为什么需要代理：
 *   浏览器限制 HTTP 资源在 HTTPS 页面下加载（Mixed Content）
 *   大部分直播源是 HTTP 链接，部署到 HTTPS 后需要代理转换为 HTTPS
 */

const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1'
const PROXY_BASE = import.meta.env.VITE_PROXY_URL || ''

// Worker 健康状态缓存（避免每次请求都探测）
let workerHealthy = true
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL = 300000 // 5 分钟重新检测

/**
 * 检测 Worker 是否可用
 * 只在生产环境、有 PROXY_BASE 配置时检测
 */
async function checkWorkerHealth() {
  const now = Date.now()
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL) return workerHealthy

  lastHealthCheck = now
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(`${PROXY_BASE}/health`, { signal: controller.signal })
    clearTimeout(timeout)
    workerHealthy = res.ok
  } catch {
    workerHealthy = false
  }
  return workerHealthy
}

/**
 * 对直播流 URL 进行代理包装
 * 开发环境直接返回原 URL
 * 生产环境对 HTTP 链接进行代理，HTTPS 直连
 */
export function getProxiedUrl(url) {
  if (!url) return url
  // 开发环境：Vite 是 HTTP 服务器，无 Mixed Content 问题
  if (IS_DEV) return url
  // HTTPS 链接不需要代理
  if (url.startsWith('https://')) return url
  // 没有配置代理地址，直连
  if (!PROXY_BASE) return url
  // Worker 上次检测不可用，直连（降级）
  if (!workerHealthy) return url
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
 * 异步检测 Worker 健康状态并返回代理后的 URL
 * 相比 getProxiedUrl 的同步检测，此函数会发起一次真实的健康检查
 * 适用于首次加载或用户手动刷新时的场景
 */
export async function getProxiedUrlWithHealthCheck(url) {
  if (!url || IS_DEV || url.startsWith('https://') || !PROXY_BASE) {
    return getProxiedUrl(url)
  }
  await checkWorkerHealth()
  return getProxiedUrl(url)
}

/**
 * 重置 Worker 健康状态（当播放失败时可调用，尝试重新启用代理）
 */
export function resetWorkerHealth() {
  lastHealthCheck = 0
  workerHealthy = true
}
