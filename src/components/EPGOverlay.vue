<template>
  <Transition name="epg-slide">
    <div
      v-if="visible && programmes.length > 0"
      class="absolute inset-0 z-30 flex flex-col justify-end"
    >
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/40" @click="$emit('close')"></div>

      <!-- ===== EPG 面板（底部半屏） ===== -->
      <div
        class="relative w-full bg-black/90 backdrop-blur-2xl border-t border-white/10 shadow-2xl flex flex-col"
        style="max-height: 45vh;"
      >
        <!-- 头部 -->
        <div class="flex-shrink-0 px-8 py-5 border-b border-white/[0.04] flex items-center justify-between">
          <div class="flex items-center gap-4">
            <!-- 频道 Logo -->
            <div v-if="channelLogo" class="w-12 h-12 rounded-xl overflow-hidden bg-white/5 border border-white/10">
              <img :src="channelLogo" class="w-full h-full object-contain" alt="" />
            </div>
            <div>
              <h2 class="text-3xl font-bold text-white">{{ channelName }}</h2>
              <p class="text-xl text-white/40 mt-0.5">节目表</p>
            </div>
          </div>
          <div class="flex items-center gap-4">
            <!-- 日期导航 -->
            <button class="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors" @click="prevDay">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span class="text-xl text-white/60">{{ currentDayLabel }}</span>
            <button class="p-2 rounded-xl hover:bg-white/10 text-white/40 hover:text-white transition-colors" @click="nextDay">
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
            <button
              class="p-2 rounded-xl hover:bg-white/10 text-white/30 hover:text-white transition-colors"
              @click="$emit('close')"
            >
              <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- ===== 时间轴 ===== -->
        <div class="flex-1 overflow-y-auto scrollbar-thin px-6 py-4">
          <div class="space-y-1">
            <div
              v-for="(prog, idx) in programmes"
              :key="idx"
              class="flex items-stretch gap-4 px-5 py-3 rounded-xl transition-colors cursor-pointer"
              :class="isCurrent(prog)
                ? 'bg-emerald-500/10 border-l-4 border-emerald-500'
                : 'hover:bg-white/[0.02] border-l-4 border-transparent'"
              @click="scrollToProgramme(idx)"
            >
              <!-- 时间 -->
              <div class="w-24 flex-shrink-0 flex flex-col items-end justify-center">
                <span
                  class="text-2xl font-mono leading-tight"
                  :class="isCurrent(prog) ? 'text-emerald-400 font-bold' : 'text-white/50'"
                >
                  {{ formatTime(prog.start) }}
                </span>
                <span class="text-lg text-white/20 font-mono">{{ formatTime(prog.end) }}</span>
              </div>

              <!-- 时间线 -->
              <div class="flex flex-col items-center w-6 flex-shrink-0">
                <div class="w-0.5 flex-1 bg-white/[0.06]"></div>
                <div
                  class="w-3 h-3 rounded-full border-2 flex-shrink-0"
                  :class="isCurrent(prog)
                    ? 'bg-emerald-500 border-emerald-500 shadow-lg shadow-emerald-500/30'
                    : 'bg-transparent border-white/20'"
                ></div>
                <div class="w-0.5 flex-1 bg-white/[0.06]"></div>
              </div>

              <!-- 节目信息 -->
              <div class="flex-1 min-w-0 py-1">
                <div
                  class="text-2xl leading-snug"
                  :class="isCurrent(prog) ? 'text-white font-bold' : 'text-white/70'"
                >
                  {{ prog.title }}
                </div>
                <div v-if="prog.desc" class="text-xl text-white/30 mt-1 line-clamp-2">
                  {{ prog.desc }}
                </div>
                <!-- 当前播放标签 -->
                <span
                  v-if="isCurrent(prog)"
                  class="inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-lg"
                >
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  正在播放
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- 底部 EPG 来源 -->
        <div class="flex-shrink-0 px-8 py-3 border-t border-white/[0.04] text-lg text-white/20 text-center">
          {{ epgSource }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { formatProgrammeTime } from '../utils/epgParser.js'

const props = defineProps({
  visible: Boolean,
  programmes: { type: Array, default: () => [] },
  channelName: { type: String, default: '' },
  channelLogo: { type: String, default: '' },
  epgSource: { type: String, default: 'EPG' },
})

defineEmits(['close'])

// ===== 当前时间（每分钟刷新） =====
const now = ref(new Date())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 30000)
})

onBeforeUnmount(() => {
  clearInterval(timer)
})

// ===== 日期导航 =====
const dayOffset = ref(0)

const currentDayLabel = computed(() => {
  const d = new Date()
  d.setDate(d.getDate() + dayOffset.value)
  const today = new Date()
  const diff = Math.round((d - today) / (1000 * 60 * 60 * 24))
  if (diff === 0) return '今天'
  if (diff === 1) return '明天'
  if (diff === -1) return '昨天'
  return d.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', weekday: 'short' })
})

function prevDay() {
  dayOffset.value--
}

function nextDay() {
  dayOffset.value++
}

// ===== 判断当前节目 =====
function isCurrent(prog) {
  const n = now.value
  const end = prog.end || new Date(n.getTime() + 3600000)
  return prog.start <= n && end > n
}

// ===== 格式化时间 =====
function formatTime(date) {
  return formatProgrammeTime(date)
}

// ===== 滚动到当前节目 =====
function scrollToProgramme(idx) {
  // 简单实现：点击节目时滚动到该位置
  // 实际滚动由 CSS scroll-margin 处理
}

// 打开时自动滚动到当前节目
watch(() => props.visible, async (val) => {
  if (val) {
    dayOffset.value = 0
    // 等待 DOM 渲染后滚动到当前节目
    setTimeout(() => {
      const currentEl = document.querySelector('.border-l-4.border-emerald-500')
      currentEl?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 200)
  }
})
</script>

<style scoped>
/* ===== 滑入动画 ===== */
.epg-slide-enter-active {
  animation: epgUp 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.epg-slide-leave-active {
  animation: epgDown 0.25s ease-in;
}
@keyframes epgUp {
  from { transform: translateY(100%); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes epgDown {
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(100%); opacity: 0; }
}

/* ===== 滚动条 ===== */
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.06);
  border-radius: 99px;
}
</style>
