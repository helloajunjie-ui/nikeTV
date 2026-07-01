<template>
  <Transition name="hud-fade">
    <div
      v-if="visible"
      class="absolute inset-0 z-30 pointer-events-none"
    >
      <!-- ===== 顶部信息栏 ===== -->
      <div class="absolute top-0 left-0 right-0 p-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-auto">
        <div class="flex items-center justify-between">
          <!-- 左侧：频道信息 -->
          <div class="flex items-center gap-4">
            <!-- 频道 Logo -->
            <div
              v-if="channel?.logo"
              class="w-16 h-16 rounded-2xl overflow-hidden bg-white/5 border border-white/10 flex-shrink-0"
            >
              <img
                :src="channel.logo"
                :alt="channel.name"
                class="w-full h-full object-contain"
                loading="lazy"
                @error="($event.target.style.display = 'none')"
              />
            </div>
            <div v-else class="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center flex-shrink-0">
              <span class="text-2xl font-bold text-white/30">{{ channel?.name?.charAt(0) || '?' }}</span>
            </div>

            <!-- 频道名称 + 分组 -->
            <div class="flex flex-col">
              <h1 class="text-4xl font-bold text-white drop-shadow-lg leading-tight">{{ channel?.name || '—' }}</h1>
              <div class="flex items-center gap-3 mt-1">
                <span class="text-xl text-white/50">{{ channel?.group || '' }}</span>
                <span v-if="channel?.urls && channel.urls.length > 1" class="text-lg text-white/30">
                  线路 {{ (channel._activeIdx || 0) + 1 }}/{{ channel.urls.length }}
                </span>
              </div>
            </div>
          </div>

          <!-- 右侧：时间 + 源信息 -->
          <div class="flex items-center gap-4">
            <!-- 当前时间 -->
            <div class="text-right">
              <div class="text-2xl text-white/70 font-light">{{ currentTime }}</div>
              <div class="text-lg text-white/30">{{ currentDate }}</div>
            </div>
            <!-- 源名称 -->
            <div class="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-lg text-white/60">
              {{ sourceLabel || '本地源' }}
            </div>
          </div>
        </div>
      </div>

      <!-- ===== 底部控制栏 ===== -->
      <div class="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent pointer-events-auto">
        <div class="flex items-center justify-between">
          <!-- 左侧：EPG 当前节目 -->
          <div v-if="currentProgramme" class="flex items-center gap-3">
            <div class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span class="text-xl text-white/60 truncate max-w-md">{{ currentProgramme.title }}</span>
            <span class="text-lg text-white/30 font-mono">{{ formatTime(currentProgramme.start) }} - {{ formatTime(currentProgramme.end) }}</span>
          </div>
          <div v-else class="text-xl text-white/30">暂无节目信息</div>

          <!-- 右侧：音量指示 -->
          <div class="flex items-center gap-3">
            <svg class="w-6 h-6 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
            </svg>
            <div class="w-24 h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                class="h-full bg-white/50 rounded-full transition-all duration-200"
                :style="{ width: (volume * 100) + '%' }"
              ></div>
            </div>
            <span class="text-lg text-white/50 font-mono w-10">{{ Math.round(volume * 100) }}</span>
          </div>
        </div>
      </div>

      <!-- ===== 操作提示（底部居中） ===== -->
      <div class="absolute bottom-28 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div class="flex items-center gap-6 text-lg text-white/30">
          <span class="flex items-center gap-2">
            <kbd class="px-2 py-0.5 rounded bg-white/10 text-white/50 text-sm">↑↓</kbd>
            切台
          </span>
          <span class="flex items-center gap-2">
            <kbd class="px-2 py-0.5 rounded bg-white/10 text-white/50 text-sm">←→</kbd>
            音量
          </span>
          <span class="flex items-center gap-2">
            <kbd class="px-2 py-0.5 rounded bg-white/10 text-white/50 text-sm">Enter</kbd>
            菜单
          </span>
          <span class="flex items-center gap-2">
            <kbd class="px-2 py-0.5 rounded bg-white/10 text-white/50 text-sm">0-9</kbd>
            跳转
          </span>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { formatProgrammeTime } from '../utils/epgParser.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  channel: { type: Object, default: null },
  sourceLabel: { type: String, default: '' },
  volume: { type: Number, default: 1 },
  currentProgramme: { type: Object, default: null },
})

// ===== 实时时钟 =====
const now = ref(new Date())
let clockTimer = null

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  clearInterval(clockTimer)
})

const currentTime = computed(() => {
  return now.value.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
})

const currentDate = computed(() => {
  return now.value.toLocaleDateString('zh-CN', { weekday: 'short', month: 'short', day: 'numeric' })
})

function formatTime(date) {
  return formatProgrammeTime(date)
}
</script>

<style scoped>
/* ===== HUD 淡入淡出 ===== */
.hud-fade-enter-active { transition: opacity 0.2s ease-out; }
.hud-fade-leave-active { transition: opacity 0.3s ease-in; }
.hud-fade-enter-from,
.hud-fade-leave-to { opacity: 0; }

/* ===== kbd 标签样式 ===== */
kbd {
  font-family: inherit;
}
</style>
