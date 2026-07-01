/**
 * 源管理器 - 自动更新 + 健康度检测
 *
 * 核心策略：
 * 1. 启动时加载缓存的频道列表
 * 2. 后台异步检测每个源的可用性（HEAD 请求）
 * 3. 死源自动标记 + 跳过
 * 4. 定期从上游 GitHub RAW 源刷新频道列表
 * 5. 所有 URL 通过 Worker 代理（由 proxyUrl.js 处理）
 */

import { get, set } from 'idb-keyval'

const HEALTH_CACHE_KEY = 'nikotv-health'
const CHECK_TIMEOUT = 5000 // 每个源检测超时 5s
const MAX_CONCURRENT = 5   // 并发检测数

/**
 * 检测单个直播源是否可用
 * 通过 HEAD 请求检查响应状态
 */
export async function checkSourceHealth(url) {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT)

    const response = await fetch(url, {
      method: 'HEAD',
      signal: controller.signal,
      mode: 'cors',
    })

    clearTimeout(timer)
    return response.ok || response.status === 200 || response.status === 206
  } catch {
    return false
  }
}

/**
 * 批量检测频道健康度
 * @param {Array} channels - 频道列表
 * @param {Function} onProgress - 进度回调 (checked, total, dead)
 * @returns {Array} 存活频道列表
 */
export async function filterAliveChannels(channels, onProgress) {
  const results = []
  const deadUrls = new Set()
  let checked = 0

  // 分批并发检测
  for (let i = 0; i < channels.length; i += MAX_CONCURRENT) {
    const batch = channels.slice(i, i + MAX_CONCURRENT)
    const batchResults = await Promise.allSettled(
      batch.map(async (ch) => {
        const alive = await checkSourceHealth(ch.url)
        return { ch, alive }
      })
    )

    // 批次完成后统一处理结果
    for (const result of batchResults) {
      checked++
      if (result.status === 'fulfilled' && result.value.alive) {
        results.push(result.value.ch)
      } else {
        deadUrls.add(result.value?.ch?.url || 'unknown')
      }
    }
    onProgress?.(checked, channels.length, deadUrls.size)
  }

  return results
}

/**
 * 从上游源刷新频道列表
 * 直接 fetch，不再使用公共代理
 */
export async function refreshFromUpstream(sourceUrl) {
  if (!sourceUrl) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    const response = await fetch(sourceUrl, {
      signal: controller.signal,
      cache: 'no-cache',
      headers: { 'Cache-Control': 'no-cache' },
    })
    clearTimeout(timer)
    if (!response.ok) return null
    return await response.text()
  } catch {
    return null
  }
}

/**
 * 缓存健康状态
 */
export async function cacheHealthStatus(channels) {
  const healthMap = {}
  channels.forEach(ch => {
    healthMap[ch.url] = true
  })
  try {
    await set(HEALTH_CACHE_KEY, {
      timestamp: Date.now(),
      aliveUrls: healthMap,
    })
  } catch { /* ignore */ }
}

/**
 * 检测当前网络是否支持 IPv6
 */
export async function checkIPv6Support() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 3000)
    await fetch('https://api6.ipify.org', {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal,
    })
    clearTimeout(timer)
    return true
  } catch {
    return false
  }
}
