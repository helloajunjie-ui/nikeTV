<template>
  <div class="relative">
    <!-- 遮罩（点击关闭） -->
    <div class="fixed inset-0 z-30" @click="$emit('close')"></div>

    <div
      class="absolute right-4 top-16 z-40 w-72 bg-black/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl"
    >
      <!-- 头部 -->
      <div class="px-4 py-3 border-b border-white/10">
        <div class="flex items-center justify-between">
          <h3 class="text-sm font-semibold text-white/80">源健康度</h3>
          <div class="flex items-center gap-2">
            <span class="text-xs text-white/40">{{ aliveCount }}/{{ totalCount }} 可用</span>
            <button
              class="p-1 rounded-md text-white/30 hover:text-white hover:bg-white/10 transition-all"
              @click="$emit('close')"
            >
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- 检测进度 -->
      <div v-if="checking" class="px-4 py-3">
        <div class="flex items-center gap-2 mb-2">
          <div class="w-4 h-4 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
          <span class="text-xs text-white/50">检测中 {{ checkedCount }}/{{ totalCount }}...</span>
        </div>
        <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden">
          <div
            class="h-full bg-white/30 rounded-full transition-all duration-300"
            :style="{ width: progress + '%' }"
          ></div>
        </div>
      </div>

      <!-- 统计 -->
      <div v-else-if="totalCount > 0" class="px-4 py-3 space-y-2">
        <div class="flex items-center justify-between text-xs">
          <span class="text-green-400/80">● 可用</span>
          <span class="text-white/60">{{ aliveCount }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-red-400/60">● 失效</span>
          <span class="text-white/60">{{ deadCount }}</span>
        </div>
        <div class="flex items-center justify-between text-xs">
          <span class="text-white/30">存活率</span>
          <span class="text-white/60">{{ survivalRate }}%</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div v-else class="px-4 py-6 text-center text-xs text-white/30">
        暂无检测数据
      </div>

      <!-- 操作 -->
      <div class="px-4 py-3 border-t border-white/10 flex gap-2">
        <button
          class="flex-1 px-3 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs text-white/70 transition-colors disabled:opacity-40"
          :disabled="checking"
          @click="$emit('check')"
        >
          {{ checking ? '检测中...' : '重新检测' }}
        </button>
        <button
          class="flex-1 px-3 py-2 bg-white/5 hover:bg-white/10 rounded-xl text-xs text-white/50 transition-colors"
          @click="$emit('refresh')"
        >
          刷新源
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  checking: Boolean,
  checked: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  alive: { type: Number, default: 0 },
  dead: { type: Number, default: 0 },
})

defineEmits(['check', 'refresh'])

const checkedCount = computed(() => props.checked)
const totalCount = computed(() => props.total)
const aliveCount = computed(() => props.alive)
const deadCount = computed(() => props.dead)

const progress = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((checkedCount.value / totalCount.value) * 100)
})

const survivalRate = computed(() => {
  if (totalCount.value === 0) return 0
  return Math.round((aliveCount.value / totalCount.value) * 100)
})
</script>
