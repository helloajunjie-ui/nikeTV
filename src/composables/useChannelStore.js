import { ref, computed } from 'vue'
import { get, set, del } from 'idb-keyval'

const STORE_KEY = 'nikotv-channels'
const SOURCES_KEY = 'nikotv-sources'
const ACTIVE_KEY = 'nikotv-active-index'

// 全局单例状态
const channels = ref([])
const activeIndex = ref(0)
const isLoading = ref(false)

/**
 * 多源频道聚合状态管理
 *
 * 数据结构（频道聚合模式）：
 *   sources: [{ id, label, url, addedAt }]
 *   channels: [{
 *     id: string,          // 唯一标识：tvgId || name（小写去空格）
 *     name: string,        // 显示名称
 *     tvgId: string,
 *     group: string,       // 统一分组
 *     logo: string,
 *     urls: [{             // 多线路
 *       url: string,
 *       sourceId: string,
 *       alive: boolean,    // 健康状态
 *     }],
 *     _activeIdx: number,  // 当前使用的线路索引
 *   }]
 *
 * 合并策略：
 *   同一 sourceId 内按 tvgId || name 合并（同源多线路）
 *   跨源同名频道也合并（不同源的同一频道）
 *   分组取第一个源的 group-title
 */
const sources = ref([])

export function useChannelStore() {
  // 当前频道
  const currentChannel = computed(() => {
    return channels.value[activeIndex.value] || null
  })

  // 频道总数
  const totalChannels = computed(() => channels.value.length)

  // 当前频道所属源（取第一个线路的 sourceId）
  const currentSource = computed(() => {
    const ch = currentChannel.value
    if (!ch || !ch.urls || ch.urls.length === 0) return null
    return sources.value.find(s => s.id === ch.urls[0].sourceId) || null
  })

  /**
   * 生成频道唯一 ID
   */
  function channelId(ch) {
    return (ch.tvgId || ch.name || '').toLowerCase().replace(/\s+/g, '')
  }

  /**
   * 加载持久化数据
   */
  async function loadChannels() {
    isLoading.value = true
    try {
      const savedChannels = await get(STORE_KEY)
      const savedSources = await get(SOURCES_KEY)
      const savedIndex = await get(ACTIVE_KEY)
      if (savedChannels) channels.value = savedChannels
      if (savedSources) sources.value = savedSources
      if (savedIndex !== undefined) activeIndex.value = savedIndex
    } catch (e) {
      console.warn('加载数据失败:', e)
    } finally {
      isLoading.value = false
    }
  }

  /**
   * 添加一个源（聚合模式）
   * 同名频道合并为多线路，返回 { added, total }
   */
  async function addSource(channelList, sourceMeta = {}) {
    // 用 URL 做 sourceId，如果无 URL（粘贴内容）则用 label 或时间戳
    const sourceId = sourceMeta.url || sourceMeta.label || `source-${Date.now()}`
    const existingSource = sources.value.find(s => s.id === sourceId)

    if (existingSource) {
      existingSource.label = sourceMeta.label || existingSource.label
      existingSource.addedAt = Date.now()
    } else {
      sources.value.push({
        id: sourceId,
        label: sourceMeta.label || sourceMeta.url || `源 ${sources.value.length + 1}`,
        url: sourceMeta.url || '',
        addedAt: Date.now(),
      })
    }

    // 构建新频道的 Map：id → urls[]
    const newMap = new Map()
    for (const ch of channelList) {
      const id = channelId(ch)
      if (!id) continue
      if (!newMap.has(id)) newMap.set(id, [])
      newMap.get(id).push({
        url: ch.url,
        sourceId,
        alive: true,
      })
    }

    // 合并到现有 channels
    const existingMap = new Map()
    for (const ch of channels.value) {
      existingMap.set(ch.id, ch)
    }

    for (const [id, urls] of newMap) {
      if (existingMap.has(id)) {
        // 频道已存在 → 追加新线路（去重）
        const existing = existingMap.get(id)
        for (const u of urls) {
          if (!existing.urls.some(eu => eu.url === u.url)) {
            existing.urls.push(u)
          }
        }
        // 如果旧 group 是"未分类"且新频道有具体分组，则更新
        const firstCh = channelList.find(c => channelId(c) === id)
        if (firstCh?.group && existing.group === '未分类') {
          existing.group = firstCh.group
        }
      } else {
        // 新频道 → 创建条目
        const firstCh = channelList.find(c => channelId(c) === id)
        existingMap.set(id, {
          id,
          name: firstCh?.name || id,
          tvgId: firstCh?.tvgId || '',
          group: firstCh?.group || '未分类',
          logo: firstCh?.logo || '',
          urls,
          _activeIdx: 0,
        })
      }
    }

    channels.value = Array.from(existingMap.values())

    // 修正 activeIndex
    if (activeIndex.value >= channels.value.length) {
      activeIndex.value = Math.max(0, channels.value.length - 1)
    }

    await persist()
    return {
      added: channelList.length,
      total: channels.value.length,
    }
  }

  /**
   * 移除一个源及其所有线路
   */
  async function removeSource(sourceId) {
    sources.value = sources.value.filter(s => s.id !== sourceId)

    // 移除该源的所有线路
    for (const ch of channels.value) {
      ch.urls = ch.urls.filter(u => u.sourceId !== sourceId)
    }
    // 移除没有线路的频道
    channels.value = channels.value.filter(ch => ch.urls.length > 0)

    if (activeIndex.value >= channels.value.length) {
      activeIndex.value = Math.max(0, channels.value.length - 1)
    }
    await persist()
  }

  /**
   * 获取某个源下的频道数（按有该源线路的频道计数）
   */
  function getSourceChannelCount(sourceId) {
    return channels.value.filter(ch => ch.urls.some(u => u.sourceId === sourceId)).length
  }

  /**
   * 切换到指定频道
   */
  async function switchTo(index) {
    if (index < 0 || index >= channels.value.length) return false
    activeIndex.value = index
    await set(ACTIVE_KEY, index)
    return true
  }

  /**
   * 切换到下一个频道
   */
  async function nextChannel() {
    if (channels.value.length === 0) return false
    const next = (activeIndex.value + 1) % channels.value.length
    return switchTo(next)
  }

  /**
   * 切换到上一个频道
   */
  async function prevChannel() {
    if (channels.value.length === 0) return false
    const prev = (activeIndex.value - 1 + channels.value.length) % channels.value.length
    return switchTo(prev)
  }

  /**
   * 切换当前频道的线路
   */
  function switchLine(channel, lineIndex) {
    if (!channel || !channel.urls || lineIndex >= channel.urls.length) return false
    channel._activeIdx = lineIndex
    return true
  }

  /**
   * 获取当前频道的可用线路
   */
  function getActiveUrl(channel) {
    if (!channel || !channel.urls || channel.urls.length === 0) return null
    const active = channel.urls[channel._activeIdx]
    if (active && active.alive !== false) return active.url
    // 当前线路不可用，找第一个可用线路
    const alive = channel.urls.find(u => u.alive !== false)
    if (alive) {
      channel._activeIdx = channel.urls.indexOf(alive)
      return alive.url
    }
    // 全部不可用，返回第一个
    channel._activeIdx = 0
    return channel.urls[0]?.url || null
  }

  /**
   * 持久化
   */
  async function persist() {
    try {
      await set(STORE_KEY, channels.value)
      await set(SOURCES_KEY, sources.value)
      await set(ACTIVE_KEY, activeIndex.value)
    } catch (e) {
      console.warn('持久化失败:', e)
    }
  }

  /**
   * 清除所有数据
   */
  async function clearAll() {
    channels.value = []
    sources.value = []
    activeIndex.value = 0
    try {
      await del(STORE_KEY)
      await del(SOURCES_KEY)
      await del(ACTIVE_KEY)
    } catch (e) {
      console.warn('清除数据失败:', e)
    }
  }

  return {
    channels,
    sources,
    activeIndex,
    currentChannel,
    currentSource,
    totalChannels,
    isLoading,
    loadChannels,
    addSource,
    removeSource,
    getSourceChannelCount,
    switchTo,
    nextChannel,
    prevChannel,
    switchLine,
    getActiveUrl,
    persist,
    clearAll,
  }
}
