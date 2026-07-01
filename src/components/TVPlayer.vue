<template>
  <div class="relative w-full h-full bg-black overflow-hidden">
    <!-- 视频元素 -->
    <video
      ref="videoRef"
      :class="['w-full h-full', fitMode]"
      :style="videoStyle"
      :muted="muted"
      :poster="channel?.logo || ''"
      playsinline
      webkit-playsinline
      x5-playsinline
      autoplay
    ></video>

    <!-- 加载状态（含实时网速 + 进度条） -->
    <div v-if="loading" class="absolute inset-0 flex items-center justify-center">
      <div class="flex flex-col items-center gap-4">
        <!-- 旋转动画 -->
        <div class="w-8 h-8 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
        <!-- 加载文本 + 网速 -->
        <div class="flex flex-col items-center gap-1">
          <span class="text-white/40 text-sm">{{ loadingText }}</span>
          <span v-if="downloadSpeed > 0" class="text-white/25 text-xs font-mono">
            {{ downloadSpeed }} KB/s
          </span>
          <span v-else class="text-white/20 text-xs">等待响应...</span>
        </div>
        <!-- 加载进度条 -->
        <div class="w-40 h-0.5 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-white/30 rounded-full transition-all duration-300"
            :style="{ width: loadingProgress + '%' }"
          ></div>
        </div>
        <!-- 已等待时间 -->
        <span class="text-white/15 text-xs font-mono">{{ elapsedSeconds }}s</span>
      </div>
    </div>

    <!-- 错误提示 -->
    <div v-if="errorMsg" class="absolute inset-0 flex items-center justify-center">
      <div class="bg-black/60 backdrop-blur-sm px-6 py-3 rounded-xl text-white/70 text-sm max-w-xs text-center">
        {{ errorMsg }}
      </div>
    </div>

    <!-- 频道切换指示器（底部） -->
    <Transition name="indicator">
      <div v-if="showChannelIndicator && channel" class="absolute bottom-24 left-1/2 -translate-x-1/2 z-50">
        <div class="flex items-center gap-4 bg-black/60 backdrop-blur-md rounded-2xl px-6 py-4 border border-white/10 shadow-2xl">
          <div v-if="channel.logo" class="w-12 h-12 rounded-xl overflow-hidden bg-white/5 flex-shrink-0">
            <img :src="channel.logo" :alt="channel.name" class="w-full h-full object-contain" loading="lazy" />
          </div>
          <div class="flex flex-col">
            <span class="text-white text-2xl font-bold drop-shadow-lg">{{ channel.name }}</span>
            <span v-if="channel.urls && channel.urls.length > 1" class="text-white/40 text-sm mt-1">
              {{ channel._activeIdx + 1 }}/{{ channel.urls.length }} 线路
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- OSD 渐变遮罩 -->
    <Transition name="osd-fade">
      <div v-if="showOSD" :class="osdClasses" class="absolute inset-0 pointer-events-none"></div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import Hls from 'hls.js'
import { getProxiedUrl } from '../utils/proxyUrl.js'

const props = defineProps({
  channel: { type: Object, default: null },
  brightness: { type: Number, default: 100 },
  volume: { type: Number, default: 1 },
})

const emit = defineEmits(['next', 'prev', 'error'])

const videoRef = ref(null)
const loading = ref(false)
const loadingText = ref('加载中...')
const showOSD = ref(true)
const errorMsg = ref('')
const showChannelIndicator = ref(false)
const muted = ref(true)
const fitMode = ref('object-contain')

// 加载状态增强
const downloadSpeed = ref(0)
const loadingProgress = ref(0)
const elapsedSeconds = ref(0)

let osdTimer = null
let indicatorTimer = null
let unmuteTimer = null
let errorTimer = null
let errorMsgTimer = null // showError 的自动清除定时器
let hls = null
let errorRetryCount = 0
const MAX_RETRIES = 2

// 加载超时兜底：15 秒没加载成功自动触发错误处理
let loadTimeoutTimer = null
const LOAD_TIMEOUT = 15000
// 网速采样定时器
let speedSampler = null
// 加载计时器（秒）
let elapsedTimer = null
let loadStartTime = 0

const osdClasses = computed(() => [
  'bg-gradient-to-t from-black/70 via-black/30 to-transparent',
  'transition-opacity duration-500',
])

const videoStyle = computed(() => ({
  filter: `brightness(${props.brightness}%)`,
}))

// 监听音量变化
watch(() => props.volume, (val) => {
  const video = videoRef.value
  if (video) video.volume = val
}, { immediate: true })

// 智能视频适配
function onVideoMetaLoaded() {
  const video = videoRef.value
  if (!video) return
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  const videoRatio = vw / vh
  const screenRatio = window.innerWidth / window.innerHeight
  fitMode.value = Math.abs(videoRatio / screenRatio - 1) < 0.05 ? 'object-cover' : 'object-contain'
}

// Media Session
function updateMediaSession() {
  if (!('mediaSession' in navigator)) return
  const ch = props.channel
  if (!ch) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: ch.name || 'NikoTV',
    artist: 'NikoTV Live',
    album: ch.group || '',
    artwork: [
      { src: ch.logo || '/icons/icon-192.svg', sizes: '192x192', type: 'image/png' },
      { src: ch.logo || '/icons/icon-512.svg', sizes: '512x512', type: 'image/png' },
    ],
  })
  navigator.mediaSession.setActionHandler('nexttrack', () => emit('next'))
  navigator.mediaSession.setActionHandler('previoustrack', () => emit('prev'))
  navigator.mediaSession.setActionHandler('play', () => videoRef.value?.play())
  navigator.mediaSession.setActionHandler('pause', () => videoRef.value?.pause())
}

// PiP
async function togglePiP() {
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture()
    } else if (videoRef.value) {
      await videoRef.value.requestPictureInPicture()
    }
  } catch { /* silent */ }
}

function onVisibilityChange() {
  if (document.hidden && videoRef.value) {
    const tryPiP = async () => {
      try {
        if (videoRef.value.paused) await videoRef.value.play()
        await new Promise(resolve => requestAnimationFrame(resolve))
        await togglePiP()
      } catch { /* silent */ }
    }
    tryPiP()
  }
}

// ===== 多线路支持 =====

/**
 * 获取当前频道应该播放的 URL
 * 优先使用 _activeIdx 指定的线路，如果不可用则找第一个可用线路
 */
function getCurrentUrl() {
  const ch = props.channel
  if (!ch || !ch.urls || ch.urls.length === 0) return null
  const active = ch.urls[ch._activeIdx]
  if (active && active.alive !== false) return active.url
  // fallback: 找第一个 alive !== false 的线路
  const alive = ch.urls.find(u => u.alive !== false)
  if (alive) {
    ch._activeIdx = ch.urls.indexOf(alive)
    return alive.url
  }
  // 全部标记为不可用，仍尝试第一个
  ch._activeIdx = 0
  return ch.urls[0]?.url || null
}

/**
 * 切换到下一条线路
 */
function nextLine() {
  const ch = props.channel
  if (!ch || !ch.urls || ch.urls.length <= 1) return false
  ch._activeIdx = (ch._activeIdx + 1) % ch.urls.length
  return true
}

// 监听频道切换
watch(() => props.channel, (newCh, oldCh) => {
  if (newCh?.id !== oldCh?.id) {
    // 清除旧错误信息和相关定时器
    clearTimeout(errorMsgTimer)
    errorMsg.value = ''
    errorRetryCount = 0
    showChannelIndicatorAnimation()
    initPlayer()
    updateMediaSession()
  }
})

function showChannelIndicatorAnimation() {
  showChannelIndicator.value = true
  clearTimeout(indicatorTimer)
  indicatorTimer = setTimeout(() => {
    showChannelIndicator.value = false
  }, 1500)
}

function showOSDTemporarily() {
  showOSD.value = true
  clearTimeout(osdTimer)
  osdTimer = setTimeout(() => { showOSD.value = false }, 3000)
}

function togglePlay() {
  const video = videoRef.value
  if (!video) return
  if (video.paused) video.play()
  else video.pause()
  showOSDTemporarily()
}

/**
 * 错误处理：重试 → 切线路 → 切频道
 */
function onVideoError() {
  const ch = props.channel
  if (!ch) return

  // 清除旧的错误定时器（防止竞态）
  clearTimeout(errorTimer)

  if (errorRetryCount < MAX_RETRIES) {
    errorRetryCount++
    showError(`加载失败，正在重试 (${errorRetryCount}/${MAX_RETRIES})`)
    errorTimer = setTimeout(() => initPlayer(), 5000)
    return
  }

  // 重试用完，尝试切线路
  if (ch.urls && ch.urls.length > 1) {
    const oldIdx = ch._activeIdx
    nextLine()
    if (ch._activeIdx !== oldIdx) {
      errorRetryCount = 0
      showError(`切换到线路 ${ch._activeIdx + 1}/${ch.urls.length}`)
      errorTimer = setTimeout(() => initPlayer(), 5000)
      return
    }
  }

  // 所有线路都试过了，切到下一个频道
  showError('当前频道所有线路不可用，切换到下一个频道')
  errorTimer = setTimeout(() => emit('next'), 5000)
}

function showError(msg) {
  errorMsg.value = msg
  clearTimeout(errorMsgTimer)
  errorMsgTimer = setTimeout(() => { errorMsg.value = '' }, 3000)
}

function initPlayer() {
  const video = videoRef.value
  const url = getCurrentUrl()
  if (!video || !url) return

  // 清理旧实例和所有定时器
  clearTimeout(errorTimer)
  clearTimeout(loadTimeoutTimer)
  clearInterval(speedSampler)
  clearInterval(elapsedTimer)
  if (hls) {
    hls.destroy()
    hls = null
  }
  video.removeEventListener('loadedmetadata', onReady)
  video.removeEventListener('error', onVideoError)
  video.removeEventListener('loadedmetadata', onVideoMetaLoaded)

  loading.value = true
  loadingText.value = `线路 ${(props.channel?._activeIdx || 0) + 1}/${props.channel?.urls?.length || 1}`
  errorRetryCount = 0
  downloadSpeed.value = 0
  loadingProgress.value = 0
  elapsedSeconds.value = 0
  loadStartTime = Date.now()

  // 启动加载计时器（每秒更新已等待时间）
  elapsedTimer = setInterval(() => {
    elapsedSeconds.value = Math.floor((Date.now() - loadStartTime) / 1000)
    // 进度条模拟：前 5 秒快速到 60%，之后缓慢增长
    if (loadingProgress.value < 60) {
      loadingProgress.value = Math.min(60, (elapsedSeconds.value / 5) * 60)
    } else if (loadingProgress.value < 90) {
      loadingProgress.value = 60 + (elapsedSeconds.value - 5) * 3
    }
  }, 1000)

  // 加载超时兜底：15 秒后如果还在 loading，触发错误处理
  loadTimeoutTimer = setTimeout(() => {
    if (loading.value) {
      clearInterval(elapsedTimer)
      clearInterval(speedSampler)
      onVideoError()
    }
  }, LOAD_TIMEOUT)

  const streamUrl = getProxiedUrl(url)

  // 原生 HLS 支持（iOS Safari）
  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl
    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('error', onVideoError)
    video.addEventListener('loadedmetadata', onVideoMetaLoaded)
    video.play().catch(() => {})
    return
  }

  // hls.js
  if (Hls.isSupported()) {
    hls = new Hls({
      maxMaxBufferLength: 30,
      liveSyncDuration: 3,
      liveMaxLatencyDuration: 10,
      enableWorker: true,
      lowLatencyMode: true,
      fragLoadingTimeOut: 10000,
      manifestLoadingTimeOut: 10000,
    })
    hls.loadSource(streamUrl)
    hls.attachMedia(video)

    // hls.js 网速采样：通过 frag 加载统计估算实时速度
    let lastLoadedBytes = 0
    let lastLoadTime = Date.now()
    hls.on(Hls.Events.FRAG_LOADING, () => {
      lastLoadTime = Date.now()
    })
    hls.on(Hls.Events.FRAG_LOADED, (event, data) => {
      const now = Date.now()
      const bytes = data.stats.loaded
      const elapsed = (now - lastLoadTime) / 1000
      if (elapsed > 0 && bytes > 0) {
        const speed = Math.round((bytes / 1024) / elapsed)
        if (speed > 0) downloadSpeed.value = speed
      }
      lastLoadedBytes = bytes
      lastLoadTime = now
      // 进度条：加载到 frag 说明至少 manifest 解析成功
      loadingProgress.value = Math.max(loadingProgress.value, 75)
    })

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      loadingProgress.value = 100
      onReady()
      onVideoMetaLoaded()
    })
    // hls.js 实例每次都是新的（hls.destroy() 已清理旧的），所以不需要 off
    let hlsErrorCount = 0
    const MAX_HLS_ERRORS = 5
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        hlsErrorCount++
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (hlsErrorCount < MAX_HLS_ERRORS) {
              hls.startLoad()
            } else {
              onVideoError()
            }
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            if (hlsErrorCount < MAX_HLS_ERRORS) {
              hls.recoverMediaError()
            } else {
              onVideoError()
            }
            break
          default:
            onVideoError()
            break
        }
      }
    })
  } else {
    video.src = streamUrl
    video.addEventListener('loadedmetadata', onReady, { once: true })
    video.addEventListener('error', onVideoError)
    video.addEventListener('loadedmetadata', onVideoMetaLoaded)
  }
}

function onReady() {
  loading.value = false
  // 清理加载相关定时器
  clearTimeout(loadTimeoutTimer)
  clearInterval(speedSampler)
  clearInterval(elapsedTimer)
  const video = videoRef.value
  if (video) {
    video.volume = props.volume
    video.play().catch(() => {})
    clearTimeout(unmuteTimer)
    unmuteTimer = setTimeout(() => { muted.value = false }, 500)
  }
  updateMediaSession()
  showOSDTemporarily()
}

onMounted(() => {
  if (props.channel) {
    initPlayer()
    updateMediaSession()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
})

onBeforeUnmount(() => {
  if (hls) { hls.destroy(); hls = null }
  clearTimeout(osdTimer)
  clearTimeout(indicatorTimer)
  clearTimeout(unmuteTimer)
  clearTimeout(errorTimer)
  clearTimeout(errorMsgTimer)
  clearTimeout(loadTimeoutTimer)
  clearInterval(speedSampler)
  clearInterval(elapsedTimer)
  document.removeEventListener('visibilitychange', onVisibilityChange)
})

defineExpose({ togglePiP })
</script>

<style scoped>
.osd-fade-enter-active,
.osd-fade-leave-active {
  transition: opacity 0.5s ease;
}
.osd-fade-enter-from,
.osd-fade-leave-to {
  opacity: 0;
}

.indicator-enter-active {
  animation: indicatorUp 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.indicator-leave-active {
  animation: indicatorDown 0.25s ease-in;
}
@keyframes indicatorUp {
  from { transform: translateX(-50%) translateY(20px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
@keyframes indicatorDown {
  from { transform: translateX(-50%) translateY(0); opacity: 1; }
  to { transform: translateX(-50%) translateY(20px); opacity: 0; }
}
</style>
