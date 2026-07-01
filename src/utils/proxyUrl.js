/**
 * CORS 代理 URL 工具
 *
 * 策略（四级降级）：
 *   1. HTTPS 流 → 直连（无需代理）
 *   2. HTTP 流 → Cloudflare Worker 代理（通过 VITE_PROXY_URL 配置）
 *   3. Worker 不可用/未配置 → 第三方 CORS 代理（corsproxy.io / allorigins.win）
 *   4. 第三方代理失败 → 直连（降级，部分源可能因 Mixed Content 失败）
 *
 * 为什么需要代理：
 *   浏览器限制 HTTP 资源在 HTTPS 页面下加载（Mixed Content）
 *   大部分直播源是 HTTP 链接，部署到 HTTPS 后需要代理转换为 HTTPS
 *
 * 关键设计：
 *   - getProxiedUrl() 现在是异步函数，首次调用时自动触发 Worker 健康检查
 *   - 如果通过 Worker 代理的请求失败（播放器检测到），调用 markWorkerDead() 降级
 *   - 降级后 5 分钟自动重新检测 Worker 是否恢复
 */

const IS_DEV = location.hostname === 'localhost' || location.hostname === '127.0.0.1'

// 构建时注入的 Worker 代理地址（由 vite.config.js 的 define 注入）
// 注意：Vite 的 define 是文本替换，所以这里用 __PROXY_URL__ 而非 import.meta.env
const PROXY_BASE = (typeof __PROXY_URL__ !== 'undefined' ? __PROXY_URL__ : '') || ''

// 第三方 CORS 代理列表（按优先级排序）
const THIRD_PARTY_PROXIES = [
  'https://corsproxy.io/?',
  'https://api.allorigins.win/raw?url=',
]

// Worker 健康状态
let workerHealthy = PROXY_BASE ? null : false // null = 未检测，false = 不可用，true = 可用
let lastHealthCheck = 0
const HEALTH_CHECK_INTERVAL = 300000 // 5 分钟重新检测

// 第三方代理索引（轮询，避免单个代理过载）
let thirdPartyIndex = 0

/**
 * 检测 Worker 是否可用
 * 只在生产环境、有 PROXY_BASE 配置时检测
 * 返回 Promise<boolean>
 */
async function checkWorkerHealth() {
  // 如果没有配置 Worker，直接返回 false
  if (!PROXY_BASE) {
    workerHealthy = false
    return false
  }

  const now = Date.now()
  // 如果距离上次检测不足 5 分钟，且已有确定结果，直接返回缓存
  if (now - lastHealthCheck < HEALTH_CHECK_INTERVAL && workerHealthy !== null) {
    return workerHealthy
  }

  lastHealthCheck = now
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000) // 5s 超时
    const res = await fetch(`${PROXY_BASE}/health`, {
      signal: controller.signal,
      cache: 'no-cache',
    })
    clearTimeout(timeout)
    workerHealthy = res.ok
  } catch {
    workerHealthy = false
  }
  return workerHealthy
}

/**
 * 标记 Worker 为不可用（当播放器检测到通过 Worker 代理的请求失败时调用）
 * 5 分钟后自动重新检测
 */
export function markWorkerDead() {
  workerHealthy = false
  lastHealthCheck = Date.now()
  console.warn('[proxy] Worker 代理不可用，降级到第三方代理')
}

/**
 * 重置 Worker 健康状态（当用户手动操作时可调用，尝试重新启用代理）
 */
export function resetWorkerHealth() {
  lastHealthCheck = 0
  workerHealthy = null
}

/**
 * 对直播流 URL 进行代理包装
 * 现在是异步函数：首次调用时自动检测 Worker 健康状态
 *
 * 开发环境直接返回原 URL
 * 生产环境：HTTPS 直连，HTTP 走代理链路
 */
export async function getProxiedUrl(url) {
  if (!url) return url
  // 开发环境：Vite 是 HTTP 服务器，无 Mixed Content 问题
  if (IS_DEV) return url
  // HTTPS 链接不需要代理
  if (url.startsWith('https://')) return url

  // 首次调用或缓存过期时，异步检测 Worker 健康状态
  if (workerHealthy === null) {
    await checkWorkerHealth()
  }

  // 优先使用自建 Worker 代理
  if (PROXY_BASE && workerHealthy) {
    return `${PROXY_BASE}/?url=${encodeURIComponent(url)}`
  }

  // fallback: 第三方 CORS 代理
  const proxy = THIRD_PARTY_PROXIES[thirdPartyIndex % THIRD_PARTY_PROXIES.length]
  thirdPartyIndex++
  return `${proxy}${encodeURIComponent(url)}`
}

/**
 * 批量代理频道列表中的 URL（异步版本）
 */
export async function proxyChannelList(channels) {
  const results = await Promise.all(
    channels.map(async ch => ({
      ...ch,
      urls: ch.urls ? await Promise.all(ch.urls.map(async u => ({
        ...u,
        url: await getProxiedUrl(u.url),
      }))) : ch.urls,
    }))
  )
  return results
}

/**
 * 强制检测 Worker 健康状态并返回代理后的 URL
 * 适用于首次加载或用户手动刷新时的场景
 */
export async function getProxiedUrlWithHealthCheck(url) {
  if (!url || IS_DEV || url.startsWith('https://')) {
    return url
  }
  await checkWorkerHealth()
  return getProxiedUrl(url)
}
