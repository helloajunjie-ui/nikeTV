// NikoTV Service Worker - 离线缓存 + PWA 支持 + 后台源净化
const CACHE_NAME = 'nikotv-v1'
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg',
]

// ===== 安装：预缓存关键资源 =====
self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS).catch(() => {})
    })
  )
})

// ===== 激活：清理旧缓存 =====
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    })
  )
  self.clients.claim()
})

// ===== 请求拦截：缓存优先，网络回退 =====
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // 只缓存同源资源
  if (url.origin !== self.location.origin) return

  // 不缓存 API 请求
  if (url.pathname.startsWith('/api/')) return

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        // 只缓存成功响应
        if (response.status === 200) {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone)
          })
        }
        return response
      }).catch(() => {
        // 离线时返回缓存的首页
        return caches.match('/index.html')
      })
    })
  )
})

// ===== 消息处理：接收频道列表 + 健康检测结果 =====
const SW_STORE_NAME = 'keyval'
const SW_CHANNELS_KEY = 'nikotv-channels'
const SW_GENERATION_KEY = 'nikotv-sw-generation'

// 当前 generation，每次主线程同步频道列表时递增
let currentGeneration = 0

self.addEventListener('message', (event) => {
  // 接收频道列表（来自主线程的 syncChannelsToSW）
  if (event.data && event.data.type === 'SYNC_CHANNELS') {
    const channels = event.data.channels
    if (!channels || !Array.isArray(channels)) return

    // 递增 generation，使正在进行的后台检测失效
    currentGeneration++
    const gen = currentGeneration

    // 写入 IndexedDB（与主线程 idb-keyval 的 keyval-store 数据库一致）
    const request = indexedDB.open(SW_STORE_NAME)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.createObjectStore(SW_STORE_NAME)
      }
    }
    request.onsuccess = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.close()
        return
      }
      const tx = db.transaction(SW_STORE_NAME, 'readwrite')
      const store = tx.objectStore(SW_STORE_NAME)
      // 覆盖写入频道列表（与主线程 idb-keyval 的 set(STORE_KEY, channels) 一致）
      store.put(channels, SW_CHANNELS_KEY)
      // 同时写入当前 generation
      store.put(gen, SW_GENERATION_KEY)
      tx.oncomplete = () => {
        db.close()
        // 写入完成后触发后台检测
        scheduleHealthCheck()
      }
    }
  }

  // 接收健康检测结果
  if (event.data && event.data.type === 'HEALTH_RESULT') {
    const { channelIndex, urlIndex, alive } = event.data
    updateChannelHealth(channelIndex, urlIndex, alive)
  }
})

// ===== 后台健康检测 =====
let healthCheckTimer = null
let isHealthChecking = false

function scheduleHealthCheck() {
  // 清除旧定时器
  if (healthCheckTimer) clearTimeout(healthCheckTimer)

  // 如果正在检测中，跳过（避免重叠）
  if (isHealthChecking) return

  // 延迟 5 秒后开始检测（给页面稳定时间）
  healthCheckTimer = setTimeout(() => {
    performHealthCheck()
  }, 5000)
}

async function performHealthCheck() {
  if (isHealthChecking) return
  isHealthChecking = true

  // 记录本次检测开始时的 generation
  // 如果检测过程中主线程同步了新频道列表（generation 递增），则丢弃本次结果
  const genAtStart = currentGeneration

  const channels = await getAllChannels()
  if (!channels || channels.length === 0) {
    isHealthChecking = false
    return
  }

  // 展平所有线路：{ channelIndex, urlIndex, url }
  const flatUrls = []
  for (let ci = 0; ci < channels.length; ci++) {
    const ch = channels[ci]
    if (!ch.urls) continue
    for (let ui = 0; ui < ch.urls.length; ui++) {
      flatUrls.push({ ci, ui, url: ch.urls[ui].url })
    }
  }

  if (flatUrls.length === 0) {
    isHealthChecking = false
    return
  }

  const TIMEOUT = 5000  // 每个请求超时 5s
  const deadUrls = []

  // 自适应调度
  const MAX_DURATION = 5 * 60 * 1000 // 5 分钟
  const estimatedTimePerBatch = TIMEOUT + 1000
  const maxBatches = Math.floor(MAX_DURATION / estimatedTimePerBatch)
  const dynamicBatchSize = Math.max(3, Math.ceil(flatUrls.length / maxBatches))
  const actualBatchSize = Math.min(dynamicBatchSize, 10)

  const startTime = Date.now()

  // 批量收集健康结果，避免逐条 postMessage
  const batchResults = []

  for (let i = 0; i < flatUrls.length; i += actualBatchSize) {
    const batch = flatUrls.slice(i, i + actualBatchSize)
    const results = await Promise.allSettled(
      batch.map((item) => checkUrl(item, TIMEOUT))
    )

    results.forEach((result, idx) => {
      const item = batch[idx]
      const alive = result.status === 'fulfilled' && result.value === true
      batchResults.push({ ci: item.ci, ui: item.ui, alive })
      if (!alive) {
        deadUrls.push(item.url)
      }
    })

    // 自适应间隔
    const elapsed = Date.now() - startTime
    const remaining = MAX_DURATION - elapsed
    if (remaining < 10000 && i + actualBatchSize < flatUrls.length) {
      await sleep(200)
    } else if (i + actualBatchSize < flatUrls.length) {
      await sleep(1000)
    }
  }

  // 检查 generation 是否仍然匹配
  // 如果主线程在此期间同步了新频道列表，则丢弃本次结果避免覆盖
  if (currentGeneration !== genAtStart) {
    console.log('[SW] 检测期间频道列表已更新，丢弃本次健康检测结果')
    isHealthChecking = false
    healthCheckTimer = setTimeout(() => {
      performHealthCheck()
    }, 5 * 60 * 1000)
    return
  }

  // 批量发送健康结果（替代逐条 CHANNEL_HEALTH_UPDATE）
  if (batchResults.length > 0) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'BATCH_HEALTH_UPDATE',
          results: batchResults,
          timestamp: Date.now(),
        })
      })
    })
  }

  // 通知主线程死亡线路（仅用于自动切换，不再参与计数）
  if (deadUrls.length > 0) {
    self.clients.matchAll().then(clients => {
      clients.forEach(client => {
        client.postMessage({
          type: 'DEAD_CHANNELS',
          urls: deadUrls,
          timestamp: Date.now(),
        })
      })
    })
  }

  // 自适应周期
  const actualDuration = Date.now() - startTime
  const nextInterval = Math.max(5 * 60 * 1000, Math.min(30 * 60 * 1000, actualDuration * 3))
  
  isHealthChecking = false
  healthCheckTimer = setTimeout(() => {
    performHealthCheck()
  }, nextInterval)
}

/**
 * 检测单个 URL 是否存活
 */
async function checkUrl(item, timeout) {
  if (!item || !item.url) return true

  let controller = null
  let timer = null
  let alive = false

  try {
    controller = new AbortController()
    timer = setTimeout(() => controller.abort(), timeout)

    try {
      const response = await fetch(item.url, {
        method: 'HEAD',
        signal: controller.signal,
        mode: 'cors',
      })
      alive = response.ok
    } catch {
      clearTimeout(timer)
      controller = new AbortController()
      timer = setTimeout(() => controller.abort(), timeout)
      try {
        const fallbackResp = await fetch(item.url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: controller.signal,
          mode: 'cors',
        })
        alive = fallbackResp.ok
      } catch {
        alive = false
      }
    }

    clearTimeout(timer)
    return alive
  } catch {
    return false
  }
}

// ===== IndexedDB 工具函数 =====
function getAllChannels() {
  return new Promise((resolve) => {
    const request = indexedDB.open(SW_STORE_NAME)
    request.onupgradeneeded = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.createObjectStore(SW_STORE_NAME)
      }
    }
    request.onsuccess = (e) => {
      const db = e.target.result
      if (!db.objectStoreNames.contains(SW_STORE_NAME)) {
        db.close()
        resolve([])
        return
      }
      const tx = db.transaction(SW_STORE_NAME, 'readonly')
      const store = tx.objectStore(SW_STORE_NAME)
      const getRequest = store.get(SW_CHANNELS_KEY)
      getRequest.onsuccess = () => {
        db.close()
        resolve(getRequest.result || [])
      }
      getRequest.onerror = () => {
        db.close()
        resolve([])
      }
    }
    request.onerror = () => resolve([])
  })
}

function updateChannelHealth(channelIndex, urlIndex, alive) {
  // SW 不直接写主线程的 IndexedDB（避免并发冲突）
  // 改为通过 postMessage 通知主线程更新
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'CHANNEL_HEALTH_UPDATE',
        channelIndex,
        urlIndex,
        alive,
        timestamp: Date.now(),
      })
    })
  })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}
