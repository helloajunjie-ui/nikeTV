// NikoTV Service Worker - 离线缓存 + PWA 支持
// 注意：后台批量健康检测已禁用（原因见 App.vue checkAllSources 注释）
// 批量并发 HEAD 测活 = DDoS 自己，采用懒加载模式替代
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

// ===== 后台健康检测（已禁用） =====
// 架构决策：批量并发 HEAD 测活 = DDoS 自己。
// 700+ 频道瞬间打满 Cloudflare Worker 并发限制 → 防火墙截断连接时不带 CORS 头 → 满屏 CORS 错误
// 替代方案：懒加载测活 — 用户点击频道时才播放，失败自动切下一线路
let healthCheckTimer = null
let isHealthChecking = false

function scheduleHealthCheck() {
  // 已禁用：不再执行任何后台批量测活
  // 保留函数签名避免调用处报错
}

async function performHealthCheck() {
  // 已禁用
}

async function checkUrl(item, timeout) {
  // 已禁用
  return true
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
