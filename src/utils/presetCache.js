/**
 * 预设源缓存模块
 *
 * 将预设源的 M3U 内容缓存到 IndexedDB，避免每次点击都请求 GitHub。
 * 缓存 TTL: 1 小时（预设源更新不频繁，1 小时足够）
 *
 * 策略：
 *   1. 读缓存（命中且未过期）→ 直接返回
 *   2. 读缓存（命中但已过期）→ 后台静默刷新，先返回旧数据
 *   3. 读缓存（未命中）→ 请求网络 → 写入缓存 → 返回
 */

import { get, set, del, keys } from 'idb-keyval'

const CACHE_PREFIX = 'preset_cache_'
const TTL = 60 * 60 * 1000 // 1 小时

/**
 * 生成缓存 key（基于 URL）
 */
function cacheKey(url) {
  return CACHE_PREFIX + url
}

/**
 * 从缓存读取预设源内容
 * 返回 { channels, stale }，stale=true 表示数据已过期但仍有值
 */
async function getCached(url) {
  try {
    const entry = await get(cacheKey(url))
    if (!entry) return null

    const stale = Date.now() - entry.ts > TTL
    return { channels: entry.channels, stale }
  } catch {
    return null
  }
}

/**
 * 写入缓存
 */
async function setCached(url, channels) {
  try {
    await set(cacheKey(url), {
      channels,
      ts: Date.now(),
    })
  } catch {
    // 缓存写入失败不影响主流程
  }
}

/**
 * 获取预设源频道列表（带缓存）
 *
 * @param {string} url - 预设源 URL
 * @param {(url: string) => Promise<Array>} fetcher - 网络请求函数
 * @returns {Promise<{ channels: Array, fromCache: boolean }>}
 */
export async function getPresetChannels(url, fetcher) {
  // 1. 尝试读缓存
  const cached = await getCached(url)
  if (cached) {
    // 缓存命中，如果未过期直接返回
    if (!cached.stale) {
      return { channels: cached.channels, fromCache: true }
    }
    // 已过期：先返回旧数据，同时后台刷新
    // 不 await，让刷新在后台进行；catch 防止未捕获的 Promise 拒绝
    refreshInBackground(url, fetcher).catch(() => {})
    return { channels: cached.channels, fromCache: true }
  }

  // 2. 缓存未命中，请求网络
  const channels = await fetcher(url)
  if (channels && channels.length > 0) {
    // 写入缓存（不阻塞）
    setCached(url, channels)
  }
  return { channels: channels || [], fromCache: false }
}

/**
 * 后台静默刷新缓存
 */
async function refreshInBackground(url, fetcher) {
  try {
    const channels = await fetcher(url)
    if (channels && channels.length > 0) {
      try {
        await setCached(url, channels)
      } catch {
        // 缓存写入失败不影响主流程
      }
    }
  } catch {
    // 后台刷新失败不影响用户，下次还会尝试
  }
}

/**
 * 清除所有预设源缓存
 */
export async function clearPresetCache() {
  const allKeys = await keys()
  const presetKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX))
  for (const key of presetKeys) {
    await del(key)
  }
}
