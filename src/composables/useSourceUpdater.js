/**
 * 源列表自动更新器
 *
 * 流程：
 * 1. 定期请求 Worker /source-version 获取最新版本号
 * 2. 与本地缓存的版本号对比
 * 3. 有新版本 → 从 GitHub RAW 拉取最新 iptv4.m3u
 * 4. 替换当前频道列表（不打断播放）
 *
 * Worker 上 SOURCE_VERSION 需要手动递增（每次更新 iptv4.m3u 后）
 */

import { get, set } from 'idb-keyval'

const VERSION_CACHE_KEY = 'nikotv-source-version'
const CHECK_INTERVAL = 60 * 60 * 1000 // 1 小时检查一次
const WORKER_BASE = (typeof __PROXY_URL__ !== 'undefined' ? __PROXY_URL__ : '') || ''

/**
 * 检查源列表是否有更新
 * @returns {Promise<{hasUpdate: boolean, version: string|null, url: string|null}>}
 */
export async function checkSourceUpdate() {
  if (!WORKER_BASE) return { hasUpdate: false, version: null, url: null }

  try {
    const resp = await fetch(`${WORKER_BASE}/source-version`, {
      signal: AbortSignal.timeout(8000),
    })
    if (!resp.ok) return { hasUpdate: false, version: null, url: null }

    const { version, url } = await resp.json()
    const cachedVersion = await get(VERSION_CACHE_KEY)

    if (cachedVersion === undefined) {
      // 首次运行，缓存版本号但不触发更新
      await set(VERSION_CACHE_KEY, version)
      return { hasUpdate: false, version, url }
    }

    const hasUpdate = cachedVersion !== version
    if (hasUpdate) {
      await set(VERSION_CACHE_KEY, version)
    }

    return { hasUpdate, version, url }
  } catch {
    return { hasUpdate: false, version: null, url: null }
  }
}

/**
 * 拉取最新源列表
 * @param {string} url - 源列表下载地址
 * @returns {Promise<string|null>}
 */
export async function fetchLatestSource(url) {
  if (!url) return null
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      cache: 'no-cache',
    })
    if (!resp.ok) return null
    return await resp.text()
  } catch {
    return null
  }
}

/**
 * 启动自动更新检测
 * @param {Function} onUpdate - 检测到更新时的回调 (m3uContent) => Promise<void>
 * @returns {Function} stop 函数
 */
export function startAutoUpdate(onUpdate) {
  let timer = null
  let stopped = false

  async function poll() {
    if (stopped) return

    const { hasUpdate, url } = await checkSourceUpdate()
    if (hasUpdate && url && !stopped) {
      const m3uContent = await fetchLatestSource(url)
      if (m3uContent && !stopped) {
        await onUpdate(m3uContent)
      }
    }

    if (!stopped) {
      timer = setTimeout(poll, CHECK_INTERVAL)
    }
  }

  // 首次检查延迟 10 秒，给页面加载留出时间
  timer = setTimeout(poll, 10000)

  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
