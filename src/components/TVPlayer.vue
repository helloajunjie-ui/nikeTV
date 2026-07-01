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

    <!-- ===== 加载状态（底部进度条，不遮挡视频） ===== -->
    <div v-if="loading" class="absolute bottom-0 left-0 right-0 z-40">
      <!-- 进度条 -->
      <div class="h-1 bg-white/10">
        <div
          class="h-full bg-gradient-to-r from-blue-400/60 to-purple-400/60 transition-all duration-300"
          :style="{ width: loadingProgress + '%' }"
        ></div>
      </div>
      <!-- 加载信息 -->
      <div class="flex items-center justify-between px-6 py-3 bg-gradient-to-t from-black/80 to-transparent">
        <div class="flex items-center gap-3">
          <div class="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
          <span class="text-xl text-white/60">{{ loadingText }}</span>
        </div>
        <div class="flex items-center gap-4">
          <span v-if="downloadSpeed > 0" class="text-xl text-white/30 font-mono">{{ downloadSpeed }} KB/s</span>
          <span class="text-xl text-white/20 font-mono">{{ elapsedSeconds }}s</span>
        </div>
      </div>
    </div>

    <!-- ===== 错误提示（底部横幅，不遮挡视频） ===== -->
    <Transition name="error-banner">
      <div v-if="errorMsg" class="absolute bottom-20 left-1/2 -translate-x-1/2 z-40">
        <div class="flex items-center gap-3 bg-black/70 backdrop-blur-md px-6 py-3 rounded-2xl border border-red-500/20 shadow-2xl">
          <svg class="w-6 h-6 text-red-400/80 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span class="text-xl text-white/80">{{ errorMsg }}</span>
        </div>
      </div>
    </Transition>

    <!-- ===== 频道切换指示器（全屏居中动画） ===== -->
    <Transition name="channel-switch">
      <div v-if="showChannelIndicator && channel" class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
        <div class="flex flex-col items-center gap-4">
          <!-- 台标 -->
          <div class="w-28 h-28 rounded-3xl overflow-hidden bg-white/5 border-2 border-white/10 shadow-2xl shadow-black/50">
            <img
              v-if="channel.logo"
              :src="channel.logo"
              :alt="channel.name"
              class="w-full h-full object-contain p-2"
              loading="lazy"
              @error="($event.target.style.display = 'none')"
            />
            <div v-else class="w-full h-full flex items-center justify-center">
              <span class="text-5xl font-bold text-white/30">{{ channel.name.charAt(0) }}</span>
            </div>
          </div>
          <!-- 频道名 -->
          <div class="text-center">
            <h2 class="text-5xl font-bold text-white drop-shadow-2xl">{{ channel.name }}</h2>
            <div class="flex items-center justify-center gap-3 mt-2">
              <span v-if="channel.group" class="text-2xl text-white/50">{{ channel.group }}</span>
              <span v-if="channel.urls && channel.urls.length > 1" class="text-2xl text-white/30">
                线路 {{ (channel._activeIdx || 0) + 1 }}/{{ channel.urls.length }}
              </span>
            </div>
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
const MAX_RETRIES = 1 // 每条线路只重试 1 次，快速遍历所有线路

// 加载超时兜底：12 秒没加载成功自动触发错误处理
let loadTimeoutTimer = null
const LOAD_TIMEOUT = 12000
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
 *
 * 策略：每条线路最多重试 1 次，快速遍历所有可用线路。
 * 如果所有线路都挂了，自动切到下一个频道。
 * hls.js 内部 NETWORK_ERROR 已自愈 2 次，到这里说明确实有问题。
 */
function onVideoError() {
  const ch = props.channel
  if (!ch) return

  // 清除旧的错误定时器（防止竞态）
  clearTimeout(errorTimer)

  if (errorRetryCount < MAX_RETRIES) {
    errorRetryCount++
    showError(`加载失败，正在重试 (${errorRetryCount}/${MAX_RETRIES})`)
    errorTimer = setTimeout(() => initPlayer(), 3000) // 重试等待缩短到 3 秒
    return
  }

  // 重试用完，尝试切线路
  if (ch.urls && ch.urls.length > 1) {
    const oldIdx = ch._activeIdx
    nextLine()
    if (ch._activeIdx !== oldIdx) {
      errorRetryCount = 0
      showError(`切换到线路 ${ch._activeIdx + 1}/${ch.urls.length}`)
      errorTimer = setTimeout(() => initPlayer(), 3000) // 切线路等待缩短到 3 秒
      return
    }
  }

  // 所有线路都试过了，切到下一个频道
  showError('当前频道所有线路不可用，切换到下一个频道')
  errorTimer = setTimeout(() => emit('next'), 3000) // 切频道等待缩短到 3 秒
}

function showError(msg) {
  errorMsg.value = msg
  clearTimeout(errorMsgTimer)
  errorMsgTimer = setTimeout(() => { errorMsg.value = '' }, 3000)
}

async function initPlayer() {
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

  // 加载超时兜底：12 秒后如果还在 loading，触发错误处理
  // 配合 MAX_RETRIES=1 + 3s 等待，整体链路：3s(重试) + 3s(切线路) + 3s(切频道) ≈ 12s 内完成全部兜底
  loadTimeoutTimer = setTimeout(() => {
    if (loading.value) {
      clearInterval(elapsedTimer)
      clearInterval(speedSampler)
      onVideoError()
    }
  }, LOAD_TIMEOUT)

  // 视频流直接播放，不走 Worker 代理
  // IPTV 源多为 HTTP，浏览器 Mixed Content 警告不影响播放
  // 走代理反而增加延迟、触发 ORB 拦截、被上游封禁数据中心 IP
  const streamUrl = url

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
    // 策略：hls.js 内部最多自愈 2 次，之后直接放弃当前线路走 onVideoError
    // 避免 hls.js 默认的 5 次重试导致用户等待过久
    let hlsErrorCount = 0
    const MAX_HLS_ERRORS = 2
    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        hlsErrorCount++
        if (hlsErrorCount >= MAX_HLS_ERRORS) {
          // 自愈失败，放弃当前线路
          // 不再标记 Worker 不可用——Worker 是可靠的，失败的是源本身
          onVideoError()
          return
        }
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad()
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError()
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

/* ===== 频道切换动画（全屏居中放大） ===== */
.channel-switch-enter-active {
  animation: switchIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.channel-switch-leave-active {
  animation: switchOut 0.25s ease-in;
}
@keyframes switchIn {
  from { transform: scale(0.8); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}
@keyframes switchOut {
  from { transform: scale(1); opacity: 1; }
  to { transform: scale(1.1); opacity: 0; }
}

/* ===== 错误横幅动画 ===== */
.error-banner-enter-active {
  animation: bannerIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.error-banner-leave-active {
  animation: bannerOut 0.2s ease-in;
}
@keyframes bannerIn {
  from { transform: translateX(-50%) translateY(10px); opacity: 0; }
  to { transform: translateX(-50%) translateY(0); opacity: 1; }
}
@keyframes bannerOut {
  from { transform: translateX(-50%) translateY(0); opacity: 1; }
  to { transform: translateX(-50%) translateY(10px); opacity: 0; }
}
</style>
