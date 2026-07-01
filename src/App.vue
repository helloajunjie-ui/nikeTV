<template>
  <div class="relative w-full h-screen bg-black overflow-hidden">
    <!-- ===== 启动画面 ===== -->
    <StartupScreen
      :visible="showStartup"
      :progress="startupProgress"
      :status-text="startupStatus"
    />

    <!-- ===== 主播放界面 ===== -->
    <div
      v-if="showPlayer"
      class="absolute inset-0"
    >
      <!-- 播放器 -->
      <TVPlayer
        ref="playerRef"
        :channel="currentChannel"
        :brightness="brightness"
        :volume="volume"
        @prev="prevChannel"
        @next="nextChannel"
        @toggle-hud="toggleHUD"
      />

      <!-- ===== HUD 叠加层（电视版） ===== -->
      <HUDOverlay
        :visible="showHUD"
        :channel="currentChannel"
        :source-label="currentSource?.label || ''"
        :volume="volume"
        :current-programme="epgCurrent"
      />

      <!-- ===== 频道列表（全屏覆盖层） ===== -->
      <ChannelList
        v-if="showChannelList"
        ref="channelListRef"
        :visible="showChannelList"
        :channels="channels"
        :active-index="activeIndex"
        @select="selectChannel"
        @close="showChannelList = false"
      />

      <!-- ===== 源健康面板 ===== -->
      <Transition name="slide-panel">
        <SourceHealthPanel
          v-if="showHealthPanel"
          :checking="healthChecking"
          :checked="healthChecked"
          :total="totalLines"
          :alive="aliveCount"
          :dead="deadCount"
          @check="checkAllSources"
          @refresh="refreshSource"
          @close="showHealthPanel = false"
        />
      </Transition>

      <!-- ===== EPG 节目表（底部半屏） ===== -->
      <EPGOverlay
        v-if="showEPG"
        :visible="showEPG"
        :programmes="epgProgrammes"
        :channel-name="currentChannel?.name || ''"
        :channel-logo="currentChannel?.logo || ''"
        epg-source="epg.pw"
        @close="showEPG = false"
      />

      <!-- ===== 数字键输入指示器 ===== -->
      <ChannelNumberInput
        :visible="showDigitInput"
        :digits="digitBuffer"
      />
    </div>

    <!-- ===== 导入面板（Teleport 到 body） ===== -->
    <ImportSheet
      :visible="showImport"
      :sources="sources"
      :channels="channels"
      :total-channels="totalChannels"
      @import="handleImport"
      @remove-source="handleRemoveSource"
      @switch-source="handleSwitchSource"
      @close="showImport = false"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch, nextTick } from 'vue'
import TVPlayer from './components/TVPlayer.vue'
import ChannelList from './components/ChannelList.vue'
import ImportSheet from './components/ImportSheet.vue'
import EPGOverlay from './components/EPGOverlay.vue'
import SourceHealthPanel from './components/SourceHealthPanel.vue'
import StartupScreen from './components/StartupScreen.vue'
import HUDOverlay from './components/HUDOverlay.vue'
import ChannelNumberInput from './components/ChannelNumberInput.vue'
import { useChannelStore } from './composables/useChannelStore.js'
import { useTVControls } from './composables/useTVControls.js'
import { useTVNavigation } from './composables/useTVNavigation.js'
import { parseEPG, getCurrentProgramme, buildEpgIndex, findProgrammes } from './utils/epgParser.js'
import { refreshFromUpstream } from './utils/sourceManager.js'
import { parseM3U, loadM3USource } from './utils/m3uParser.js'
import { startAutoUpdate as startUpstreamUpdate, matchRepo, fetchLatestSource } from './utils/sourceUpdater.js'
import { startAutoUpdate as startSourceUpdate } from './composables/useSourceUpdater.js'
import { getPresetChannels } from './utils/presetCache.js'
import { getProxyUrl } from './utils/proxyUrl.js'
import { presets } from './utils/presets.js'

// ===== 频道状态 =====
const {
  channels,
  sources,
  activeIndex,
  currentChannel,
  currentSource,
  totalChannels,
  isLoading: loadingChannels,
  loadChannels,
  addSource,
  removeSource,
  switchTo,
  nextChannel,
  prevChannel,
  getActiveUrl,
  persist,
} = useChannelStore()

// ===== UI 状态 =====
const showImport = ref(false)
const showChannelList = ref(false)
const showHUD = ref(false)
const showHealthPanel = ref(false)
const showEPG = ref(false)
const showDigitInput = ref(false)

// ===== 启动画面 =====
const showStartup = ref(true)
const startupProgress = ref(0)
const startupStatus = ref('正在初始化...')

// ===== 源健康度（懒加载模式：不再批量测活） =====
// 架构决策：不再在客户端做大规模并发 HEAD 测活。
// 700 个频道瞬间并发请求 Cloudflare Worker → Worker 被限流 → 上游 IP 被拉黑 → 防火墙切断连接时不带 CORS 头 → 满屏 CORS 错误 → JS 主线程卡死
// 正确做法：用户点击频道时才请求播放，行就行，不行就自动切下一线路
const healthChecking = ref(false)
const healthChecked = ref(0)
const aliveCount = ref(0)
const deadCount = ref(0)

const totalLines = computed(() => {
  return channels.value.reduce((sum, ch) => sum + (ch.urls?.length || 0), 0)
})

const aliveRate = computed(() => {
  if (healthChecked.value === 0) return 0
  return aliveCount.value / healthChecked.value
})

// ===== EPG =====
const epgData = ref({})
const epgIndex = ref(null) // 模糊匹配索引
const epgCurrent = ref(null)
const epgNext = ref(null)
const epgProgrammes = ref([]) // 当前频道完整节目列表
let epgTimer = null

// ===== 上游源自动更新 =====
let stopAutoUpdate = null
let stopSourceUpdate = null

/**
 * 根据 URL 匹配对应的仓库和文件路径
 * 委托给 sourceUpdater.js 中的 matchRepo 函数，避免重复定义
 */
function matchRepoForUpdate(url) {
  return matchRepo(url)
}

// ===== IPv6 =====
const ipv6Supported = ref(null)

// ===== 电视遥控器控制（替代 useGesture） =====
const channelListRef = ref(null)

const {
  volume,
  brightness,
  interactionMode,
  digitBuffer,
  setMode,
  clearDigitBuffer,
} = useTVControls({
  // 频道控制
  onPrevChannel: () => prevChannel(),
  onNextChannel: () => nextChannel(),
  // 音量控制
  onVolumeUp: () => { /* volume 由 useTVControls 内部管理 */ },
  onVolumeDown: () => { /* volume 由 useTVControls 内部管理 */ },
  // 焦点导航（委托给 ChannelList）
  onFocusPrev: () => channelListRef.value?.focusPrev?.(),
  onFocusNext: () => channelListRef.value?.focusNext?.(),
  onFocusLeft: () => channelListRef.value?.prevGroup?.(),
  onFocusRight: () => channelListRef.value?.nextGroup?.(),
  // Enter / Back
  onEnter: () => {
    if (showChannelList.value) {
      // 频道列表中确认选择
      const idx = channelListRef.value?.focusIndex
      if (typeof idx === 'number' && idx >= 0) {
        selectChannel(idx)
      }
    } else if (showEPG.value) {
      // EPG 中关闭
      showEPG.value = false
    } else {
      toggleHUD()
    }
  },
  onBack: () => {
    if (showChannelList.value) {
      showChannelList.value = false
      setMode('default')
    } else if (showEPG.value) {
      showEPG.value = false
      setMode('default')
    } else if (showHealthPanel.value) {
      showHealthPanel.value = false
    } else if (showImport.value) {
      showImport.value = false
    } else {
      toggleHUD()
    }
  },
  // 分组切换（频道列表模式）
  onPrevGroup: () => channelListRef.value?.prevGroup?.(),
  onNextGroup: () => channelListRef.value?.nextGroup?.(),
  // 数字键
  onDigit: (digits) => {
    showDigitInput.value = true
    if (digits.length === 3) {
      jumpToChannel(parseInt(digits, 10))
    }
  },
  // 触摸手势
  onSwipeLeft: () => nextChannel(),
  onSwipeRight: () => prevChannel(),
  onSwipeUp: () => prevChannel(),
  onSwipeDown: () => nextChannel(),
})

// ===== 数字键跳转 =====
function jumpToChannel(num) {
  if (num <= 0 || num > channels.value.length) {
    // 超出范围，忽略
    clearDigitBuffer()
    showDigitInput.value = false
    return
  }
  switchTo(num - 1) // 频道号从 1 开始，索引从 0 开始
  clearDigitBuffer()
  showDigitInput.value = false
}

// 监听数字键输入完成
watch(digitBuffer, (val) => {
  if (val.length === 3) {
    // 已通过 onDigit 回调处理
  } else if (val.length === 0) {
    showDigitInput.value = false
  }
})

// ===== 过渡控制 =====
const showPlayer = ref(false)

// ===== 空状态一键导入 =====
// 从 presets.js 共享配置中取前 7 个常用源（避免与 ImportSheet.vue 重复定义）
const quickPresets = presets
const importingPreset = ref(false)
const presetError = ref('')

async function quickImportPreset(url, label) {
  importingPreset.value = true
  presetError.value = ''
  try {
    // 走缓存：首次请求网络，后续直接从 IndexedDB 读取
    const { channels } = await getPresetChannels(url, async (fetchUrl) => {
      return await loadM3USource(fetchUrl)
    })
    if (!channels || channels.length === 0) {
      presetError.value = '未识别到有效频道'
      return
    }
    await handleImport(channels, { url, label })
  } catch (e) {
    presetError.value = `加载失败: ${e.message}`
  } finally {
    importingPreset.value = false
  }
}

// ===== 切换源（从 HUD 点击源按钮） =====
function handleSwitchSource(sourceId) {
  // 找到该源的第一个频道并播放
  const idx = channels.value.findIndex(c => c.urls.some(u => u.sourceId === sourceId))
  if (idx >= 0) {
    switchTo(idx)
    // 切换源时关闭频道列表，避免视觉不一致
    showChannelList.value = false
  }
}

const hasChannels = computed(() => channels.value.length > 0)

// 监听频道变化，控制启动画面
watch(hasChannels, (val) => {
  if (val && showStartup.value) {
    // 频道加载完成，启动画面进度推进
    startupProgress.value = 100
    startupStatus.value = '加载完成'
    // 短暂延迟后隐藏启动画面，显示播放器
    setTimeout(() => {
      showStartup.value = false
      showPlayer.value = true
    }, 500)
  } else if (!val && showPlayer.value) {
    showPlayer.value = false
    setTimeout(() => {
      showStartup.value = true
      startupProgress.value = 0
      startupStatus.value = '正在初始化...'
    }, 300)
  }
}, { immediate: true })

// ===== 频道切换 =====
function selectChannel(index) {
  switchTo(index)
  showChannelList.value = false
  setMode('default')
}

// ===== 多源导入（追加模式） =====
async function handleImport(list, sourceMeta) {
  const result = await addSource(list, sourceMeta)
  showImport.value = false

  if (result && result.added > 0) {
    // 启动画面已由 watch(hasChannels) 处理
    // 同步频道列表给 SW（后台健康检测用）
    setTimeout(() => syncChannelsToSW(), 300)
    // 批量测活已禁用（checkAllSources 现在是空函数）
    // 采用懒加载模式：用户点击频道时才播放，失败自动切下一线路
  }
}

// ===== 移除源 =====
async function handleRemoveSource(sourceId) {
  await removeSource(sourceId)
  // 同步更新后的频道列表给 SW
  setTimeout(() => syncChannelsToSW(), 300)
}

// ===== 源健康度检测（已禁用：不再批量测活） =====
// 架构决策：批量并发 HEAD 测活 = DDoS 自己。
// 700+ 频道瞬间打满 Cloudflare Worker 并发限制 → 防火墙截断连接时不带 CORS 头 → 满屏 CORS 错误 → 主线程卡死
// 替代方案：懒加载测活（Lazy Health Check）— 用户点击频道时才播放，失败自动切下一线路
async function checkAllSources() {
  // 已禁用：不再执行任何批量测活
  console.log('[HealthCheck] 批量测活已禁用，采用懒加载模式')
}

// ===== 从上游刷新源 =====
async function refreshSource() {
  // 刷新所有有 URL 的源
  for (const src of sources.value) {
    if (!src.url) continue
    const content = await refreshFromUpstream(src.url)
    if (content) {
      const freshChannels = parseM3U(content)
      if (freshChannels.length > 0) {
        await addSource(freshChannels, { url: src.url, label: src.label })
      }
    }
  }
  // 批量测活已禁用，不再调用 checkAllSources()
  // 同步更新后的频道列表给 SW
  setTimeout(() => syncChannelsToSW(), 600)
}

// ===== EPG 更新（支持模糊匹配） =====
function updateEPG() {
  const ch = currentChannel.value
  if (!ch) {
    showEPG.value = false
    return
  }

  // 使用模糊匹配查找节目单
  const tvgId = ch.tvgId || ch.name || ''
  const programmes = findProgrammes(tvgId, epgIndex.value)
  if (!programmes || programmes.length === 0) {
    showEPG.value = false
    return
  }

  // 保存完整节目列表供左侧面板展示
  epgProgrammes.value = programmes

  const { current, next } = getCurrentProgramme(programmes)
  epgCurrent.value = current
  epgNext.value = next
  showEPG.value = !!(current || next)
}

watch(currentChannel, () => {
  updateEPG()
})

// ===== 源更新通知（极简设计，不打断观看） =====
let updateNotifTimer = null

function showUpdateNotification(sourceLabel) {
  // 移除旧通知
  const old = document.getElementById('nikotv-source-update')
  if (old) old.remove()
  clearTimeout(updateNotifTimer)

  const toast = document.createElement('div')
  toast.id = 'nikotv-source-update'
  toast.textContent = `${sourceLabel} 源已自动更新`
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '80px',
    right: '24px',
    zIndex: '9998',
    padding: '8px 16px',
    background: 'rgba(255,255,255,0.06)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '10px',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '12px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    opacity: '0',
    transform: 'translateY(8px)',
    transition: 'opacity 0.4s ease, transform 0.4s ease',
    pointerEvents: 'none',
  })
  document.body.appendChild(toast)

  // 淡入
  requestAnimationFrame(() => {
    toast.style.opacity = '1'
    toast.style.transform = 'translateY(0)'
  })

  // 3 秒后淡出
  updateNotifTimer = setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateY(8px)'
    setTimeout(() => toast.remove(), 400)
  }, 3000)
}

// ===== TVPlayer ref =====
const playerRef = ref(null)

function togglePiP() {
  playerRef.value?.togglePiP?.()
}

// ===== SW 消息通道（后台静默净化，聚合模式） =====
function syncChannelsToSW() {
  if (!navigator.serviceWorker?.controller) return
  // 发送频道列表给 SW，包含所有线路 URL
  const channelList = channels.value.map(ch => ({
    id: ch.id,
    name: ch.name,
    urls: ch.urls.map(u => ({
      url: u.url,
      sourceId: u.sourceId,
      alive: u.alive,
    })),
  }))
  navigator.serviceWorker.controller.postMessage({
    type: 'SYNC_CHANNELS',
    channels: channelList,
  })
}

function onSWMessage(event) {
  const data = event.data
  if (!data) return

  switch (data.type) {
    case 'DEAD_CHANNELS': {
      const deadUrls = new Set(data.urls || [])
      if (deadUrls.size === 0) return

      // 保护当前正在播放的频道的当前线路（可能只是网络抖动）
      const currentCh = currentChannel.value
      const currentUrl = currentCh ? getActiveUrl(currentCh) : null
      const filteredDeadUrls = new Set(
        [...deadUrls].filter(url => url !== currentUrl)
      )

      if (filteredDeadUrls.size === 0) return

      // 标记死亡线路，而非删除频道
      let changed = false
      for (const ch of channels.value) {
        if (!ch.urls) continue
        for (const u of ch.urls) {
          if (filteredDeadUrls.has(u.url)) {
            u.alive = false
            changed = true
          }
        }
      }

      if (changed) {
        // DEAD_CHANNELS 不参与计数（BATCH_HEALTH_UPDATE 已经计过了）
        // 仅用于触发自动切换

        // 检查当前频道是否所有线路都死了
        if (currentCh && currentCh.urls && currentCh.urls.every(u => u.alive === false)) {
          // 当前频道所有线路都挂了，自动切下一个
          nextChannel()
        }

        persist()
      }
      break
    }

    case 'BATCH_HEALTH_UPDATE': {
      // SW 批量健康结果更新（替代逐条 CHANNEL_HEALTH_UPDATE）
      // 使用 channelId 而非索引定位，防止 channels 数组变化导致索引错位
      const { results } = data
      if (!results || !Array.isArray(results)) break

      let checked = 0
      let dead = 0

      for (const item of results) {
        // 优先使用 channelId 定位，fallback 到索引
        let ch = null
        if (item.channelId) {
          ch = channels.value.find(c => c.id === item.channelId)
        }
        if (!ch && typeof item.ci === 'number') {
          ch = channels.value[item.ci]
        }
        if (ch && ch.urls && ch.urls[item.ui]) {
          ch.urls[item.ui].alive = item.alive
          ch.urls[item.ui]._lastChecked = Date.now()
          checked++
          if (!item.alive) dead++
        }
      }

      // 只在非 healthChecking 状态下更新统计
      if (!healthChecking.value && checked > 0) {
        healthChecked.value += checked
        deadCount.value += dead
        aliveCount.value = healthChecked.value - deadCount.value
      }
      break
    }

    case 'CHANNEL_HEALTH_UPDATE': {
      // SW 单条线路健康状态更新（保留兼容，但实际已被 BATCH_HEALTH_UPDATE 替代）
      const { channelIndex, urlIndex, alive } = data
      if (typeof channelIndex !== 'number' || typeof urlIndex !== 'number') break
      const ch = channels.value[channelIndex]
      if (ch && ch.urls && ch.urls[urlIndex]) {
        ch.urls[urlIndex].alive = alive
        ch.urls[urlIndex]._lastChecked = Date.now()
        // 只在非 healthChecking 状态下更新统计
        if (!healthChecking.value) {
          healthChecked.value++
          if (!alive) deadCount.value++
          aliveCount.value = healthChecked.value - deadCount.value
        }
      }
      break
    }
  }
}

// ===== HUD 控制 =====
let hudTimer = null
function toggleHUD() {
  showHUD.value = !showHUD.value
  if (showHUD.value) {
    clearTimeout(hudTimer)
    hudTimer = setTimeout(() => {
      showHUD.value = false
    }, 5000)
  }
}

// ===== 键盘快捷键（已委托给 useTVControls） =====
// 键盘事件已由 useTVControls 统一管理，此处仅保留备用入口
function onKeyDown(e) {
  // 仅处理 useTVControls 未覆盖的按键
  switch (e.key) {
    case 'i':
    case 'I':
      // I 键打开导入面板
      showImport.value = !showImport.value
      break
    case 'h':
    case 'H':
      // H 键切换健康面板
      showHealthPanel.value = !showHealthPanel.value
      break
  }
}

// ===== 生命周期 =====
onMounted(async () => {
  // 启动画面进度：开始加载频道
  startupProgress.value = 10
  startupStatus.value = '正在加载频道列表...'

  await loadChannels()

  // 首次使用：自动导入默认源（本地精选，零网络延迟 + 频道最全）
  if (channels.value.length === 0) {
    startupProgress.value = 30
    startupStatus.value = '正在导入默认源...'
    const defaultUrl = '/iptv4.m3u'
    const defaultLabel = '🇨🇳 央视·卫视·地方 聚合'
    try {
      const { channels: defaultChannels } = await getPresetChannels(defaultUrl, async (fetchUrl) => {
        return await loadM3USource(fetchUrl)
      })
      if (defaultChannels && defaultChannels.length > 0) {
        await addSource(defaultChannels, { url: defaultUrl, label: defaultLabel })
      }
    } catch (e) {
      console.warn('默认源加载失败:', e.message)
    }
  }

  startupProgress.value = 50
  startupStatus.value = '正在加载 EPG 节目表...'

  // IPv6 支持检测改为惰性加载——只在用户导入 IPv6 源时触发
  // 避免启动时请求不可达服务导致控制台网络错误
  ipv6Supported.value = false

  // 尝试加载 EPG（走 Worker 代理 + localStorage 12h 缓存）
  async function fetchEPG(epgUrl) {
    const cacheKey = `epg_cache_${epgUrl}`
    const cachedData = localStorage.getItem(cacheKey)
    const cacheTime = localStorage.getItem(`${cacheKey}_time`)

    // 缓存命中且未过期（12 小时）
    if (cachedData && cacheTime && (Date.now() - cacheTime < 12 * 60 * 60 * 1000)) {
      return cachedData
    }

    // 走 Worker 代理拉取，彻底解决 CORS
    const safeUrl = getProxyUrl(epgUrl)
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const resp = await fetch(safeUrl, { signal: controller.signal })
      clearTimeout(timer)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const text = await resp.text()
      // 写入缓存
      try {
        localStorage.setItem(cacheKey, text)
        localStorage.setItem(`${cacheKey}_time`, Date.now())
      } catch { /* localStorage 容量满则忽略 */ }
      return text
    } catch (e) {
      clearTimeout(timer)
      throw e
    }
  }

  const epgUrls = [
    'https://epg.pw/xmltv/epg.xml',
    'https://epg.best/xmltv/epg.xml',
    'https://epg.pw/xmltv/epg.xml?type=cn',
  ]
  for (const url of epgUrls) {
    try {
      const xml = await fetchEPG(url)
      if (xml && xml.includes('<tv>')) {
        epgData.value = parseEPG(xml)
        epgIndex.value = buildEpgIndex(epgData.value)
        updateEPG()
        break
      }
    } catch {
      // 失败则尝试下一个源
    }
  }

  startupProgress.value = 70
  startupStatus.value = '正在初始化服务...'

  // 如果有频道，同步给 SW 并后台检测健康度
  if (channels.value.length > 0) {
    // 等待 SW 激活
    if (navigator.serviceWorker?.controller) {
      syncChannelsToSW()
    } else {
      navigator.serviceWorker?.ready.then(() => {
        syncChannelsToSW()
      })
    }
    // 批量测活已禁用，不再调用 checkAllSources()
  }

  // 监听 SW 消息
  navigator.serviceWorker?.addEventListener('message', onSWMessage)

  // EPG 每分钟刷新
  epgTimer = setInterval(updateEPG, 60000)

  startupProgress.value = 85
  startupStatus.value = '正在启动自动更新...'

  // 启动上游源自动更新检测
  // 每 30 分钟检查一次所有上游仓库是否有新 commit
  // 检测到更新后静默拉取新 M3U 替换频道列表
  // 传入函数引用，使 startAutoUpdate 每次 poll 时能读取最新的 sources
  stopAutoUpdate = startUpstreamUpdate(() => sources.value, async (sourceId, sourceUrl) => {
    // 通过 URL 匹配仓库和文件路径
    const match = matchRepoForUpdate(sourceUrl)
    if (!match) return

    const { repo, filePath, branch } = match
    const content = await fetchLatestSource(repo, filePath, branch)
    if (!content) return

    const freshChannels = parseM3U(content)
    if (freshChannels.length === 0) return

    // 静默替换该源的所有频道，不打断当前播放
    const oldIndex = activeIndex.value
    const oldCh = currentChannel.value
    const oldChannelId = oldCh?.id

    await addSource(freshChannels, { url: sourceUrl, label: sources.value.find(s => s.id === sourceId)?.label || sourceUrl })

    // 恢复当前播放频道（如果还在新列表中）
    if (oldChannelId) {
      const newIndex = channels.value.findIndex(c => c.id === oldChannelId)
      if (newIndex >= 0) {
        activeIndex.value = newIndex
      } else {
        // 当前频道已不在新列表中，保持当前索引不变
        activeIndex.value = Math.min(oldIndex, channels.value.length - 1)
      }
    }

    // 同步更新后的频道列表给 SW
    setTimeout(() => syncChannelsToSW(), 300)

    // 显示微弱的更新提示
    const label = sources.value.find(s => s.id === sourceId)?.label || sourceUrl
    showUpdateNotification(label)
  })

  // 启动本地精选源（iptv4.m3u）自动更新检测
  // 每 1 小时检查 Worker /source-version，版本号变化则拉取最新列表
  stopSourceUpdate = startSourceUpdate(async (m3uContent) => {
    const freshChannels = parseM3U(m3uContent)
    if (freshChannels.length === 0) return

    // 找到本地精选源
    const localSource = sources.value.find(s => s.url === '/iptv4.m3u')
    if (!localSource) return

    const oldIndex = activeIndex.value
    const oldCh = currentChannel.value
    const oldChannelId = oldCh?.id

    await addSource(freshChannels, { url: '/iptv4.m3u', label: localSource.label })

    // 恢复当前播放频道
    if (oldChannelId) {
      const newIndex = channels.value.findIndex(c => c.id === oldChannelId)
      if (newIndex >= 0) {
        activeIndex.value = newIndex
      } else {
        activeIndex.value = Math.min(oldIndex, channels.value.length - 1)
      }
    }

    setTimeout(() => syncChannelsToSW(), 300)
    showUpdateNotification('📺 源列表已更新')
  })

  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  stopAutoUpdate?.()
  stopSourceUpdate?.()
  clearInterval(epgTimer)
  clearTimeout(hudTimer)
  clearTimeout(updateNotifTimer)
  navigator.serviceWorker?.removeEventListener('message', onSWMessage)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
/* ===== 侧栏滑入（ImportSheet / SourceHealthPanel） ===== */
.slide-panel-enter-active { transition: transform 0.25s ease-out, opacity 0.25s ease-out; }
.slide-panel-leave-active { transition: transform 0.2s ease-in, opacity 0.2s ease-in; }
.slide-panel-enter-from { transform: translateX(-100%); opacity: 0; }
.slide-panel-leave-to { transform: translateX(-100%); opacity: 0; }

/* ===== 通用动画 ===== */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
