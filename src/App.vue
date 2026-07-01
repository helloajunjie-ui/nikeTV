<template>
  <div class="relative w-full h-screen bg-black overflow-hidden">
    <!-- ===== 空状态：首次使用，直接显示预设源 ===== -->
    <Transition name="empty-state">
      <div
        v-if="showEmptyState"
        class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black px-6"
      >
        <div class="mb-6 text-center">
          <div class="w-16 h-16 mx-auto mb-3 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
            <svg class="w-8 h-8 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 class="text-2xl font-bold text-white tracking-tight">NikoTV</h1>
          <p class="text-xs text-white/30 mt-1">选择一个直播源开始观看</p>
        </div>

        <!-- 预设源一键导入 -->
        <div class="flex flex-wrap justify-center gap-2 max-w-md">
          <button
            v-for="src in quickPresets"
            :key="src.url"
            class="px-4 py-2.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-xl text-sm text-white/70 hover:text-white transition-all disabled:opacity-30"
            :disabled="importingPreset"
            @click="quickImportPreset(src.url, src.label)"
          >
            {{ src.label }}
          </button>
        </div>

        <!-- 加载状态 -->
        <div v-if="importingPreset" class="mt-4 flex items-center gap-2 text-xs text-white/40">
          <div class="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
          加载中...
        </div>

        <!-- 错误提示 -->
        <div v-if="presetError" class="mt-4 text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{{ presetError }}</div>

        <p class="text-xs text-white/20 mt-6">或按 Enter 打开源管理面板</p>
      </div>
    </Transition>

    <!-- ===== 加载中 ===== -->
    <div
      v-if="loadingChannels"
      class="absolute inset-0 flex items-center justify-center bg-black"
    >
      <div class="w-10 h-10 border-[3px] border-white/10 border-t-white/80 rounded-full animate-spin"></div>
    </div>

    <!-- ===== 主播放界面 ===== -->
    <Transition name="player-enter">
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

        <!-- ===== HUD 叠加层 ===== -->
        <Transition name="hud-fade">
          <div
            v-if="showHUD"
            class="absolute inset-0 z-30 pointer-events-none"
          >
            <!-- 顶部栏 -->
            <div class="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
              <div class="flex items-center justify-between">
                <!-- 左侧：源信息 + 频道列表 -->
                <div class="flex items-center gap-3">
                  <button
                    class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    @click="showChannelList = !showChannelList"
                    title="频道列表"
                  >
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                  </button>

                  <!-- 源指示器 -->
                  <div class="flex items-center gap-1.5">
                    <div
                      v-for="src in sources"
                      :key="src.id"
                      class="px-2 py-1 rounded-md text-xs"
                      :class="currentSource?.id === src.id ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-white/40'"
                    >
                      {{ src.label.length > 8 ? src.label.slice(0, 8) + '…' : src.label }}
                    </div>
                  </div>
                </div>

                <!-- 右侧：工具按钮 -->
                <div class="flex items-center gap-2">
                  <!-- IPv6 指示 -->
                  <div
                    v-if="ipv6Supported !== null"
                    class="px-2 py-1 rounded-md text-xs"
                    :class="ipv6Supported ? 'bg-blue-500/20 text-blue-300' : 'bg-white/5 text-white/30'"
                    :title="ipv6Supported ? 'IPv6 可用' : 'IPv6 不可用'"
                  >
                    {{ ipv6Supported ? 'IPv6' : 'IPv4' }}
                  </div>

                  <!-- 源健康度 -->
                  <button
                    class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors relative"
                    @click="showHealthPanel = !showHealthPanel"
                    title="源健康度"
                  >
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span
                      v-if="healthChecked > 0 && !healthChecking"
                      class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                      :class="aliveRate >= 0.7 ? 'bg-emerald-500' : aliveRate >= 0.3 ? 'bg-amber-500' : 'bg-red-500'"
                    ></span>
                  </button>

                  <!-- EPG 节目表 -->
                  <button
                    class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    @click="showEPG = !showEPG"
                    title="节目表"
                  >
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </button>

                  <!-- PiP 画中画 -->
                  <button
                    class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    @click="togglePiP"
                    title="画中画"
                  >
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z" />
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14 14h4v4h-4z" />
                    </svg>
                  </button>

                  <!-- 导入源 -->
                  <button
                    class="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
                    @click="showImport = true"
                    title="导入源"
                  >
                    <svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Transition>

        <!-- ===== 左侧悬停热区（鼠标用户触发频道列表） ===== -->
        <div
          class="absolute left-0 top-0 bottom-0 z-20 w-1 hover:w-4 cursor-pointer transition-all duration-150 group"
          @mouseenter="showChannelList = true"
          @mouseleave="showChannelList = false"
        >
          <div class="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-12 bg-white/10 rounded-r-md group-hover:bg-white/20 transition-colors"></div>
        </div>

        <!-- ===== 频道列表侧栏（左侧，按分组展示） ===== -->
        <ChannelList
          v-if="showChannelList"
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

        <!-- ===== EPG 节目表（左侧面板） ===== -->
        <Transition name="epg-slide">
          <EPGOverlay
            v-if="showEPG"
            :visible="showEPG"
            :programmes="epgProgrammes"
            :channel-name="currentChannel?.name || ''"
            epg-source="epg.pw"
            @close="showEPG = false"
          />
        </Transition>
      </div>
    </Transition>

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
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import TVPlayer from './components/TVPlayer.vue'
import ChannelList from './components/ChannelList.vue'
import ImportSheet from './components/ImportSheet.vue'
import EPGOverlay from './components/EPGOverlay.vue'
import SourceHealthPanel from './components/SourceHealthPanel.vue'
import { useChannelStore } from './composables/useChannelStore.js'
import { useGesture } from './composables/useGesture.js'
import { parseEPG, getCurrentProgramme, buildEpgIndex, findProgrammes } from './utils/epgParser.js'
import { filterAliveChannels, refreshFromUpstream } from './utils/sourceManager.js'
import { parseM3U, loadM3USource } from './utils/m3uParser.js'
import { startAutoUpdate, fetchLatestSource, matchRepo } from './utils/sourceUpdater.js'
import { getPresetChannels } from './utils/presetCache.js'
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

// ===== 源健康度 =====
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

/**
 * 根据 URL 匹配对应的仓库和文件路径
 * 委托给 sourceUpdater.js 中的 matchRepo 函数，避免重复定义
 */
function matchRepoForUpdate(url) {
  return matchRepo(url)
}

// ===== IPv6 =====
const ipv6Supported = ref(null)

// ===== 手势控制 =====
// 键盘映射：上下切台，左右音量
// 触摸：左侧上下=亮度，右侧上下=音量，左右滑=切台
const { brightness, volume } = useGesture({
  onSwipeLeft: () => nextChannel(),
  onSwipeRight: () => prevChannel(),
  onSwipeUp: () => prevChannel(),
  onSwipeDown: () => nextChannel(),
})

// ===== 过渡控制 =====
const showEmptyState = ref(true)
const showPlayer = ref(false)
const transitioning = ref(false)

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

// ===== 切换源（从侧栏点击已有源） =====
function handleSwitchSource(sourceId) {
  // 找到该源的第一个频道并播放
  const idx = channels.value.findIndex(c => c.urls.some(u => u.sourceId === sourceId))
  if (idx >= 0) {
    switchTo(idx)
  }
}

const hasChannels = computed(() => channels.value.length > 0)

// 监听频道变化，触发转场
watch(hasChannels, (val) => {
  if (val && showEmptyState.value) {
    transitioning.value = true
    setTimeout(() => {
      showEmptyState.value = false
      setTimeout(() => {
        showPlayer.value = true
        transitioning.value = false
      }, 50)
    }, 250)
  } else if (!val && showPlayer.value) {
    showPlayer.value = false
    setTimeout(() => {
      showEmptyState.value = true
    }, 300)
  }
}, { immediate: true })

// ===== 频道切换 =====
function selectChannel(index) {
  switchTo(index)
  showChannelList.value = false
}

// ===== 多源导入（追加模式） =====
async function handleImport(list, sourceMeta) {
  const result = await addSource(list, sourceMeta)
  showImport.value = false

  if (result && result.added > 0) {
    // 强制触发转场：从空状态切换到播放器
    if (showEmptyState.value) {
      transitioning.value = true
      setTimeout(() => {
        showEmptyState.value = false
        setTimeout(() => {
          showPlayer.value = true
          transitioning.value = false
        }, 50)
      }, 250)
    }
    // 同步频道列表给 SW（后台健康检测用）
    setTimeout(() => syncChannelsToSW(), 300)
    // Bug M: 延迟健康检测到 30 秒后，避免刚导入时网络抖动误杀频道
    // 用户刚导入的源可能部分频道需要时间建立连接
    setTimeout(() => checkAllSources(), 30000)
  }
}

// ===== 移除源 =====
async function handleRemoveSource(sourceId) {
  await removeSource(sourceId)
  // 同步更新后的频道列表给 SW
  setTimeout(() => syncChannelsToSW(), 300)
}

// ===== 源健康度检测（聚合模式：逐线路检测，标记 alive/dead） =====
async function checkAllSources() {
  if (healthChecking.value || channels.value.length === 0) return
  healthChecking.value = true
  healthChecked.value = 0
  aliveCount.value = 0
  deadCount.value = 0

  // 展平所有线路为 { channelIndex, urlIndex, url } 列表
  const flatUrls = []
  for (let ci = 0; ci < channels.value.length; ci++) {
    const ch = channels.value[ci]
    if (!ch.urls) continue
    for (let ui = 0; ui < ch.urls.length; ui++) {
      flatUrls.push({ ci, ui, url: ch.urls[ui].url })
    }
  }

  const totalLines = flatUrls.length
  let checked = 0
  let dead = 0

  // 复用 filterAliveChannels 的批量检测逻辑，但传入展平列表
  // filterAliveChannels 接受 { url } 数组，返回存活项
  const aliveLines = await filterAliveChannels(
    flatUrls.map(item => ({ url: item.url })),
    (c, t, d) => {
      checked = c
      dead = d
      healthChecked.value = c
      deadCount.value = d
      aliveCount.value = c - d
    }
  )

  const aliveUrlSet = new Set(aliveLines.map(item => item.url))

  // 标记每条线路的 alive 状态
  for (const item of flatUrls) {
    const ch = channels.value[item.ci]
    if (ch && ch.urls[item.ui]) {
      ch.urls[item.ui].alive = aliveUrlSet.has(item.url)
    }
  }

  // 清理：移除所有线路都死亡的频道（保留至少一条线路的频道）
  const before = channels.value.length
  channels.value = channels.value.filter(ch => ch.urls.some(u => u.alive !== false))

  if (channels.value.length < before) {
    // 检查是否有源的所有频道都被移除
    const activeSourceIds = new Set(
      channels.value.flatMap(ch => ch.urls.map(u => u.sourceId))
    )
    sources.value = sources.value.filter(s => activeSourceIds.has(s.id))

    if (activeIndex.value >= channels.value.length) {
      activeIndex.value = Math.max(0, channels.value.length - 1)
    }

    await persist()

    // 通知 SW 使用新频道列表
    setTimeout(() => syncChannelsToSW(), 500)
  }

  healthChecking.value = false
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
  checkAllSources()
  // 同步更新后的频道列表给 SW（checkAllSources 内部可能因无频道被移除而不触发 sync）
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
      const { results } = data
      if (!results || !Array.isArray(results)) break

      let checked = 0
      let dead = 0

      for (const item of results) {
        const ch = channels.value[item.ci]
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

// ===== 键盘快捷键 =====
function onKeyDown(e) {
  switch (e.key) {
    case 'Enter':
    case ' ':
      e.preventDefault()
      if (showEmptyState.value) {
        // 空状态下 Enter 打开源管理面板
        showImport.value = true
      } else {
        toggleHUD()
      }
      break
    case 'Escape':
      showChannelList.value = false
      showImport.value = false
      showHealthPanel.value = false
      break
  }
}

// ===== 生命周期 =====
onMounted(async () => {
  await loadChannels()

  // 首次使用：自动导入默认源（🇨🇳 聚合）
  if (channels.value.length === 0) {
    const defaultUrl = 'https://raw.githubusercontent.com/HerbertHe/iptv-sources/gh-pages/cn.m3u'
    const defaultLabel = '🇨🇳 聚合'
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

  // IPv6 支持检测改为惰性加载——只在用户导入 IPv6 源时触发
  // 避免启动时请求不可达服务导致控制台网络错误
  ipv6Supported.value = false

  // 尝试加载 EPG（多源 + 多代理 fallback）
  // 使用 AbortController 实现超时，兼容所有浏览器
  const epgConfigs = [
    // 方案一：epg.pw（稳定，支持 CORS）
    { url: 'https://epg.pw/xmltv/epg.xml', direct: true },
    // 方案二：epg.51zmt.top 通过代理
    { url: 'http://epg.51zmt.top:8000/e.xml', proxy: 'https://api.allorigins.win/raw?url=' },
    { url: 'http://epg.51zmt.top:8000/e.xml', proxy: 'https://corsproxy.io/?' },
    { url: 'http://epg.51zmt.top:8000/e.xml', proxy: 'https://api.codetabs.com/v1/proxy?quest=' },
    // 方案三：epg.best 备用
    { url: 'https://epg.best/xmltv/epg.xml', direct: true },
  ]
  for (const cfg of epgConfigs) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 8000)
    try {
      const fetchUrl = cfg.direct
        ? cfg.url
        : `${cfg.proxy}${encodeURIComponent(cfg.url)}`
      const response = await fetch(fetchUrl, { signal: controller.signal })
      clearTimeout(timer)
      if (response.ok) {
        const xml = await response.text()
        if (xml && xml.includes('<tv>')) {
          epgData.value = parseEPG(xml)
          epgIndex.value = buildEpgIndex(epgData.value)
          updateEPG()
          break
        }
      }
    } catch {
      // 网络错误或超时，清理 timer 后尝试下一个源
    }
    clearTimeout(timer)
  }

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
    setTimeout(() => checkAllSources(), 2000)
  }

  // 监听 SW 消息
  navigator.serviceWorker?.addEventListener('message', onSWMessage)

  // EPG 每分钟刷新
  epgTimer = setInterval(updateEPG, 60000)

  // 启动上游源自动更新检测
  // 每 30 分钟检查一次所有上游仓库是否有新 commit
  // 检测到更新后静默拉取新 M3U 替换频道列表
  // 传入函数引用，使 startAutoUpdate 每次 poll 时能读取最新的 sources
  stopAutoUpdate = startAutoUpdate(() => sources.value, async (sourceId, sourceUrl) => {
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

  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  stopAutoUpdate?.()
  clearInterval(epgTimer)
  clearTimeout(hudTimer)
  clearTimeout(updateNotifTimer)
  navigator.serviceWorker?.removeEventListener('message', onSWMessage)
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
/* ===== 空状态过渡 ===== */
.empty-state-enter-active {
  animation: fadeIn 0.3s ease-out;
}
.empty-state-leave-active {
  animation: fadeOutScale 0.25s ease-in forwards;
}
@keyframes fadeOutScale {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.95); }
}

/* ===== 播放器进入过渡 ===== */
.player-enter-enter-active {
  animation: playerIn 0.35s ease-out;
}
.player-enter-leave-active {
  animation: playerOut 0.2s ease-in forwards;
}
@keyframes playerIn {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes playerOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(20px); }
}

/* ===== HUD 淡入淡出 ===== */
.hud-fade-enter-active { transition: opacity 0.2s ease-out; }
.hud-fade-leave-active { transition: opacity 0.3s ease-in; }
.hud-fade-enter-from,
.hud-fade-leave-to { opacity: 0; }

/* ===== 侧栏滑入 ===== */
.slide-panel-enter-active { transition: transform 0.25s ease-out, opacity 0.25s ease-out; }
.slide-panel-leave-active { transition: transform 0.2s ease-in, opacity 0.2s ease-in; }
.slide-panel-enter-from { transform: translateX(-100%); opacity: 0; }
.slide-panel-leave-to { transform: translateX(-100%); opacity: 0; }

/* ===== EPG 滑入 ===== */
.epg-slide-enter-active { animation: epgIn 0.3s ease-out; }
.epg-slide-leave-active { animation: epgOut 0.2s ease-in; }
@keyframes epgIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes epgOut {
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(10px); }
}

/* ===== 通用 ===== */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
</style>
