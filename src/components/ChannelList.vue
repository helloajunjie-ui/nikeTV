<template>
  <Transition name="channel-list">
    <div
      v-if="visible"
      class="absolute inset-0 z-40 flex flex-col"
      style="background: rgba(0,0,0,0.85); backdrop-filter: blur(24px);"
    >
      <!-- ===== 顶部：分组标签栏 ===== -->
      <div class="flex-shrink-0 px-8 pt-6 pb-4">
        <div class="flex items-center gap-2 overflow-x-auto scrollbar-none">
          <button
            v-for="(group, gi) in groups"
            :key="group.name"
            :ref="gi === activeGroupIndex ? 'groupRef' : undefined"
            class="tv-focusable px-6 py-3 rounded-2xl text-2xl font-medium transition-all duration-200 flex-shrink-0"
            :class="gi === activeGroupIndex
              ? 'bg-white/15 text-white shadow-lg'
              : 'text-white/40 hover:text-white/70 hover:bg-white/5'"
            @click="selectGroup(gi)"
          >
            {{ group.name }}
            <span class="ml-2 text-lg text-white/30">({{ group.channels.length }})</span>
          </button>
        </div>
        <!-- 分组提示 -->
        <div class="flex items-center gap-2 mt-3 text-lg text-white/20">
          <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16l-4-4m0 0l4-4m-4 4h18" />
          </svg>
          <span>切换分组</span>
          <svg class="w-5 h-5 ml-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />
          </svg>
          <span>切换分组</span>
        </div>
      </div>

      <!-- ===== 频道列表 ===== -->
      <div class="flex-1 overflow-y-auto px-6 pb-6 scrollbar-thin">
        <div class="grid grid-cols-1 gap-2 max-w-4xl mx-auto">
          <button
            v-for="(ch, ci) in currentGroupChannels"
            :key="ch._key || ci"
            :ref="ci === focusIndex ? 'channelRef' : undefined"
            class="tv-focusable group flex items-center gap-5 px-6 py-4 rounded-2xl transition-all duration-200"
            :class="[
              ch._index === activeIndex
                ? 'bg-gradient-to-r from-blue-500/20 to-purple-500/10 border border-white/10'
                : 'hover:bg-white/[0.04] border border-transparent',
              ci === focusIndex ? 'ring-2 ring-white/40 ring-offset-2 ring-offset-transparent' : '',
            ]"
            @click="selectChannel(ch._index)"
          >
            <!-- 台标 -->
            <div class="w-16 h-16 rounded-xl overflow-hidden flex-shrink-0 flex items-center justify-center bg-white/5">
              <img
                v-if="ch.logo"
                :src="ch.logo"
                class="w-full h-full object-contain"
                alt=""
                loading="lazy"
                @error="($event.target.style.display = 'none')"
              />
              <span v-else class="text-2xl font-bold text-white/30">{{ ch.name.charAt(0) }}</span>
            </div>

            <!-- 频道信息 -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-3">
                <span
                  class="text-3xl font-medium truncate"
                  :class="ch._index === activeIndex ? 'text-white' : 'text-white/70 group-hover:text-white/90'"
                >{{ ch.name }}</span>
                <!-- 当前播放标签 -->
                <span
                  v-if="ch._index === activeIndex"
                  class="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-400 text-lg"
                >
                  <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  直播
                </span>
              </div>
              <!-- 线路信息 -->
              <div v-if="ch.urls && ch.urls.length > 1" class="text-xl text-white/30 mt-1">
                {{ ch.urls.length }} 条线路
              </div>
            </div>

            <!-- 频道号（如果有） -->
            <div v-if="ch.channelNumber" class="text-2xl text-white/20 font-mono">
              {{ ch.channelNumber }}
            </div>
          </button>
        </div>

        <!-- 空状态 -->
        <div
          v-if="currentGroupChannels.length === 0"
          class="flex flex-col items-center justify-center py-20 text-white/20"
        >
          <div class="w-24 h-24 rounded-2xl bg-white/[0.03] flex items-center justify-center mb-4">
            <svg class="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <p class="text-2xl text-white/30">该分组暂无频道</p>
        </div>
      </div>

      <!-- ===== 底部提示 ===== -->
      <div class="flex-shrink-0 px-8 py-4 border-t border-white/[0.04]">
        <div class="flex items-center justify-center gap-6 text-lg text-white/20">
          <span class="flex items-center gap-2">
            <kbd>↑↓</kbd> 选择
          </span>
          <span class="flex items-center gap-2">
            <kbd>←→</kbd> 分组
          </span>
          <span class="flex items-center gap-2">
            <kbd>Enter</kbd> 播放
          </span>
          <span class="flex items-center gap-2">
            <kbd>Back</kbd> 关闭
          </span>
        </div>
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

const emit = defineEmits(['select', 'close', 'prev-group', 'next-group'])

// ===== 分组管理 =====
const activeGroupIndex = ref(0)
const focusIndex = ref(0)

// 按 group 分组
const groups = computed(() => {
  const map = new Map()
  for (const ch of props.channels) {
    const group = ch.group || '未分类'
    if (!map.has(group)) map.set(group, [])
    map.get(group).push({ ...ch, _key: `${group}-${ch.id}` })
  }
  return Array.from(map.entries()).map(([name, channels]) => ({ name, channels }))
})

// 当前分组频道列表
const currentGroupChannels = computed(() => {
  if (groups.value.length === 0) return []
  return groups.value[activeGroupIndex.value]?.channels || []
})

// ===== 分组切换 =====
function selectGroup(index) {
  if (index < 0 || index >= groups.value.length) return
  activeGroupIndex.value = index
  focusIndex.value = 0
}

function prevGroup() {
  if (activeGroupIndex.value > 0) {
    selectGroup(activeGroupIndex.value - 1)
  }
}

function nextGroup() {
  if (activeGroupIndex.value < groups.value.length - 1) {
    selectGroup(activeGroupIndex.value + 1)
  }
}

// ===== 焦点导航 =====
function focusNext() {
  if (focusIndex.value < currentGroupChannels.value.length - 1) {
    focusIndex.value++
    scrollToFocus()
  }
}

function focusPrev() {
  if (focusIndex.value > 0) {
    focusIndex.value--
    scrollToFocus()
  }
}

function scrollToFocus() {
  nextTick(() => {
    const el = document.querySelector('[tv-focused]')
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

// ===== 选择频道 =====
function selectChannel(index) {
  emit('select', index)
}

// ===== 打开时重置焦点 =====
watch(() => props.visible, async (val) => {
  if (val) {
    activeGroupIndex.value = 0
    focusIndex.value = 0
    // 找到当前频道所在分组
    const activeCh = props.channels[props.activeIndex]
    if (activeCh?.group) {
      const gi = groups.value.findIndex(g => g.name === activeCh.group)
      if (gi >= 0) activeGroupIndex.value = gi
    }
    await nextTick()
    scrollToFocus()
  }
})

// 暴露给父组件用于焦点导航
defineExpose({
  focusNext,
  focusPrev,
  prevGroup,
  nextGroup,
  selectGroup,
  activeGroupIndex,
  focusIndex,
  groups,
})
</script>

<style scoped>
/* ===== 列表进入/离开动画 ===== */
.channel-list-enter-active {
  animation: listIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}
.channel-list-leave-active {
  animation: listOut 0.2s ease-in;
}
@keyframes listIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes listOut {
  from { opacity: 1; transform: scale(1); }
  to { opacity: 0; transform: scale(0.98); }
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

/* ===== 隐藏分组滚动条 ===== */
.scrollbar-none::-webkit-scrollbar {
  display: none;
}
.scrollbar-none {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* ===== kbd 样式 ===== */
kbd {
  font-family: inherit;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.4);
  font-size: 0.9em;
}
</style>
