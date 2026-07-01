<template>
  <Transition name="sidebar">
    <div
      v-if="visible"
      class="absolute left-0 top-0 bottom-0 z-40 flex flex-col"
      style="width: min(420px, 45vw); background: linear-gradient(135deg, rgba(8,8,18,0.75) 0%, rgba(12,12,28,0.7) 100%); backdrop-filter: blur(32px); border-right: 1px solid rgba(255,255,255,0.06);"
    >
      <!-- 头部 -->
      <div class="flex items-center justify-between px-6 py-5 border-b border-white/[0.04] flex-shrink-0">
        <div class="flex items-center gap-4">
          <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500/25 to-purple-600/25 flex items-center justify-center">
            <svg class="w-6 h-6 text-indigo-300/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
          </div>
          <div>
            <h2 class="text-3xl font-semibold text-white/90 tracking-wide">频道列表</h2>
            <p class="text-base text-white/30 mt-1">{{ channels.length }} 个频道</p>
          </div>
        </div>
        <button
          class="w-12 h-12 rounded-xl flex items-center justify-center text-white/20 hover:text-white/60 hover:bg-white/5 transition-all duration-200"
          @click="$emit('close')"
        >
          <svg class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 搜索 -->
      <div class="px-5 pt-3 pb-3 flex-shrink-0">
        <div class="relative">
          <svg class="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索频道..."
            class="w-full pl-14 pr-5 py-4 bg-white/[0.05] border border-white/[0.08] rounded-xl text-xl text-white/80 placeholder-white/25 focus:outline-none focus:border-white/25 focus:bg-white/[0.07] transition-all duration-200"
            @keydown.escape="$emit('close')"
          />
        </div>
      </div>

      <!-- 按分组展示频道 -->
      <div class="flex-1 overflow-y-auto pb-4 scrollbar-thin">
        <template v-for="group in groupedChannels" :key="group.name">
          <!-- 分组标题 -->
          <div
            v-if="group.channels.length > 0"
            class="flex items-center gap-3 px-6 pt-6 pb-2"
          >
            <div class="w-1 h-6 rounded-full bg-gradient-to-b from-indigo-400/50 to-purple-500/50"></div>
            <span class="text-lg font-semibold text-white/35 tracking-widest uppercase">{{ group.name || '未分类' }}</span>
            <span class="text-base text-white/20 ml-auto">{{ group.channels.length }}</span>
          </div>

          <!-- 该分组的频道 -->
          <div v-for="(ch, i) in group.channels" :key="ch._key || i" class="px-3">
            <button
              :ref="el => { if (ch._index === activeIndex) activeItemRef.value = el }"
              class="w-full flex items-center gap-5 px-5 py-5 rounded-2xl transition-all duration-200 group/ch"
              :class="ch._index === activeIndex
                ? 'bg-gradient-to-r from-indigo-500/20 to-purple-500/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]'
                : 'text-white/55 hover:bg-white/[0.04] hover:text-white/85'"
              @click="$emit('select', ch._index)"
            >
              <!-- 频道 Logo / 序号 -->
              <div
                class="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center text-xl font-bold tracking-wide"
                :class="ch._index === activeIndex
                  ? 'bg-indigo-500/20 text-indigo-300/80'
                  : 'bg-white/[0.05] text-white/25 group-hover/ch:bg-white/[0.08]'"
              >
                <img
                  v-if="ch.logo"
                  :src="ch.logo"
                  class="w-full h-full object-contain"
                  alt=""
                  @error="($event.target.style.display = 'none')"
                />
                <span v-else>{{ ch.name.charAt(0) }}</span>
              </div>

              <!-- 频道名称 -->
              <div class="flex-1 min-w-0 text-left">
                <p
                  class="text-xl truncate transition-all duration-200"
                  :class="ch._index === activeIndex ? 'font-semibold text-white' : 'font-medium'"
                >{{ ch.name }}</p>
              </div>

              <!-- 当前播放指示 -->
              <div
                v-if="ch._index === activeIndex"
                class="flex items-center gap-2"
              >
                <span class="w-2.5 h-2.5 rounded-full bg-indigo-400 animate-pulse"></span>
                <span class="text-base text-indigo-300/60 font-semibold">直播</span>
              </div>
            </button>
          </div>
        </template>

        <!-- 空状态 -->
        <div
          v-if="filteredChannels.length === 0"
          class="flex flex-col items-center justify-center py-20 text-white/20"
        >
          <div class="w-20 h-20 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
            <svg class="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p class="text-xl text-white/30">未找到匹配频道</p>
          <button
            class="mt-3 text-base text-white/20 hover:text-white/50 transition-colors"
            @click="searchQuery = ''"
          >清除搜索</button>
        </div>
      </div>

      <!-- 底部装饰 -->
      <div class="h-px bg-gradient-to-r from-transparent via-white/[0.04] to-transparent mx-6 flex-shrink-0"></div>
      <div class="px-6 py-4 flex items-center gap-2 flex-shrink-0">
        <div class="flex -space-x-1">
          <div class="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/20 border border-white/[0.04] flex items-center justify-center">
            <svg class="w-4 h-4 text-indigo-300/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        <span class="text-base text-white/15">NikoTV · 频道导航</span>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  visible: Boolean,
  channels: { type: Array, default: () => [] },
  activeIndex: { type: Number, default: 0 },
})

const emit = defineEmits(['select', 'close'])

const searchQuery = ref('')
const activeItemRef = ref(null)

// 搜索过滤
const filteredChannels = computed(() => {
  if (!searchQuery.value) return props.channels
  const q = searchQuery.value.toLowerCase()
  return props.channels.filter(ch =>
    ch.name.toLowerCase().includes(q) ||
    (ch.group && ch.group.toLowerCase().includes(q))
  )
})

// 按 group 分组，保留原始索引
const groupedChannels = computed(() => {
  const map = new Map()
  const list = filteredChannels.value
  const fullList = props.channels
  for (const ch of list) {
    // 聚合模式：用 id（tvgId || name 小写去空格）定位原始索引
    const originalIndex = fullList.findIndex(c => c.id === ch.id)
    const group = ch.group || '未分类'
    if (!map.has(group)) map.set(group, [])
    map.get(group).push({ ...ch, _index: originalIndex >= 0 ? originalIndex : 0, _key: `${group}-${ch.id}` })
  }
  return Array.from(map.entries()).map(([name, channels]) => ({ name, channels }))
})

// 打开时自动聚焦当前频道
watch(() => props.visible, async (val) => {
  if (val) {
    searchQuery.value = ''
    await nextTick()
    setTimeout(() => {
      activeItemRef.value?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 100)
  }
})
</script>

<style scoped>
.sidebar-enter-active {
  animation: slideIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}
.sidebar-leave-active {
  animation: slideOut 0.25s cubic-bezier(0.4, 0, 0.6, 1);
}

@keyframes slideIn {
  from { transform: translateX(-100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes slideOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(-100%); opacity: 0; }
}

/* 自定义滚动条 */
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
.scrollbar-thin::-webkit-scrollbar-thumb:hover {
  background: rgba(255,255,255,0.12);
}
</style>
