/**
 * 源管理器 - 自动更新 + 健康度检测
 * 
 * 核心策略：
 * 1. 启动时加载缓存的频道列表
 * 2. 后台异步检测每个源的可用性（HEAD 请求）
 * 3. 死源自动标记 + 跳过
 * 4. 定期从上游 GitHub RAW 源刷新频道列表
 * 5. Mixed Content 自动升级为 HTTPS（通过 Worker 代理）
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

    // 批次完成后统一处理结果，避免并发进度计数竞态
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
 * 支持 GitHub RAW 等自动维护的源
 */
/**
 * 判断当前是否为 Vite 开发环境
 */
function isDev() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1'
}

/**
 * 将 GitHub RAW URL 转换为 Vite 代理路径（开发环境）
 */
function proxyUrl(input) {
  if (!isDev()) return input
  if (input.includes('raw.githubusercontent.com')) {
    const path = input.replace('https://raw.githubusercontent.com', '')
    return `/m3u-proxy${path}`
  }
  return input
}

export async function refreshFromUpstream(sourceUrl) {
  if (!sourceUrl) return null

  const attempts = sourceUrl.startsWith('https://')
    ? [proxyUrl(sourceUrl)]
    : [
        `https://corsproxy.io/?${encodeURIComponent(sourceUrl)}`,
        `https://api.allorigins.win/raw?url=${encodeURIComponent(sourceUrl)}`,
      ]

  for (const url of attempts) {
    try {
      const response = await fetch(url, {
        cache: 'no-cache',
        headers: { 'Cache-Control': 'no-cache' },
      })
      if (!response.ok) continue
      return await response.text()
    } catch {
      continue
    }
  }

  console.warn('上游源刷新失败: 所有连接方式均失败')
  return null
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
 * 自动修复 Mixed Content 问题
 * 将 http:// 流通过 Worker 代理升级为 https://
 */
export function upgradeToHTTPS(url, proxyBase) {
  if (!proxyBase) return url
  if (url.startsWith('http://')) {
    return `${proxyBase}/?url=${encodeURIComponent(url)}`
  }
  return url
}

/**
 * 检测当前网络是否支持 IPv6
 * 使用 fetch + no-cors 模式，配合 AbortController 超时
 * 注意：此函数仅在用户主动导入 IPv6 源时调用，不在启动时自动调用
 * 即使服务不可达，no-cors + catch 也能保证不抛出未捕获异常
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
