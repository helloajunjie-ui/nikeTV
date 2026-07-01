<template>
  <Transition name="epg-panel">
    <div
      v-if="visible && programmes.length > 0"
      class="absolute left-0 top-0 bottom-0 z-30 flex"
    >
      <!-- 遮罩 -->
      <div class="absolute inset-0 bg-black/40" @click="$emit('close')"></div>

      <!-- 面板 -->
      <div class="relative w-72 max-w-[70vw] h-full bg-zinc-900/95 backdrop-blur-xl border-r border-white/10 shadow-2xl flex flex-col">
        <!-- 头部 -->
        <div class="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg class="w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <span class="text-sm font-medium text-white/80">节目表</span>
          </div>
          <button class="p-1 rounded-lg hover:bg-white/10 text-white/30 hover:text-white transition-colors" @click="$emit('close')">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <!-- 频道信息 -->
        <div class="px-4 py-3 bg-white/[0.02] border-b border-white/5">
          <div class="text-sm font-semibold text-white">{{ channelName }}</div>
        </div>

        <!-- 节目列表（时间轴） -->
        <div class="flex-1 overflow-y-auto scrollbar-thin">
          <div class="py-2">
            <div
              v-for="(prog, idx) in programmes"
              :key="idx"
              class="px-4 py-2.5 border-l-2 transition-colors"
              :class="isCurrent(prog) ? 'border-emerald-500 bg-emerald-500/10' : 'border-transparent hover:bg-white/[0.02]'"
            >
              <!-- 时间 -->
              <div class="flex items-center gap-2 mb-0.5">
                <span
                  class="text-xs font-mono"
                  :class="isCurrent(prog) ? 'text-emerald-400 font-semibold' : 'text-white/40'"
                >
                  {{ formatTime(prog.start) }}
                </span>
                <span class="text-xs text-white/20">—</span>
                <span
                  class="text-xs font-mono"
                  :class="isCurrent(prog) ? 'text-emerald-400/70' : 'text-white/30'"
                >
                  {{ formatTime(prog.end) }}
                </span>
                <!-- 当前播放指示 -->
                <span v-if="isCurrent(prog)" class="ml-auto flex items-center gap-1">
                  <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span class="text-[10px] text-emerald-500/70 uppercase tracking-wider">直播</span>
                </span>
              </div>
              <!-- 标题 -->
              <div
                class="text-sm leading-snug"
                :class="isCurrent(prog) ? 'text-white font-medium' : 'text-white/60'"
              >
                {{ prog.title }}
              </div>
              <!-- 描述 -->
              <div v-if="prog.desc && isCurrent(prog)" class="text-xs text-white/30 mt-0.5 line-clamp-2">
                {{ prog.desc }}
              </div>
            </div>
          </div>
        </div>

        <!-- 底部 EPG 来源 -->
        <div class="px-4 py-2 border-t border-white/5 text-[10px] text-white/20 text-center">
          {{ epgSource }}
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { formatProgrammeTime } from '../utils/epgParser.js'

const props = defineProps({
  visible: Boolean,
  programmes: { type: Array, default: () => [] },
  channelName: { type: String, default: '' },
  epgSource: { type: String, default: 'EPG' },
})

defineEmits(['close'])

// 使用 ref + 定时器替代 computed，确保 "当前节目" 指示每分钟刷新
const now = ref(new Date())
let timer = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 30000) // 每 30 秒刷新一次
})

onBeforeUnmount(() => {
  clearInterval(timer)
})

function isCurrent(prog) {
  const n = now.value
  const end = prog.end || new Date(n.getTime() + 3600000)
  return prog.start <= n && end > n
}

function formatTime(date) {
  return formatProgrammeTime(date)
}
</script>

<style scoped>
.epg-panel-enter-active {
  animation: panelIn 0.25s ease-out;
}
.epg-panel-leave-active {
  animation: panelOut 0.2s ease-in;
}
@keyframes panelIn {
  from { opacity: 0; transform: translateX(-16px); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes panelOut {
  from { opacity: 1; transform: translateX(0); }
  to { opacity: 0; transform: translateX(-16px); }
}

/* 滚动条 */
.scrollbar-thin::-webkit-scrollbar {
  width: 3px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,0.08);
  border-radius: 99px;
}
</style>
