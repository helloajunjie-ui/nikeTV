<template>
  <Teleport to="body">
    <Transition name="import-slide">
      <div
        v-if="visible"
        class="fixed inset-0 z-50 flex justify-end"
      >
        <!-- 遮罩 -->
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="close"></div>

        <!-- 面板（右侧滑出） -->
        <div class="relative w-80 max-w-[85vw] h-full bg-zinc-900/95 border-l border-white/10 shadow-2xl flex flex-col">
          <!-- 头部 -->
          <div class="px-5 py-4 border-b border-white/10 flex items-center justify-between">
            <h2 class="text-base font-bold text-white">源管理</h2>
            <button class="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors" @click="close">
              <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto scrollbar-thin">
            <!-- 已加载源列表 -->
            <div v-if="sources.length > 0" class="px-5 pt-4 pb-2">
              <label class="block text-xs text-white/40 mb-2 uppercase tracking-wider">已加载源</label>
              <div class="space-y-1">
                <div
                  v-for="src in sources"
                  :key="src.id"
                  class="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-lg group cursor-pointer transition-colors hover:bg-white/[0.07]"
                  @click="switchSource(src.id)"
                >
                  <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0"></div>
                  <span class="text-sm text-white/70 truncate flex-1">{{ src.label }}</span>
                  <span class="text-xs text-white/30 flex-shrink-0">{{ getSourceChannelCount(src.id) }} 频道</span>
                  <button
                    class="p-1 rounded-md text-white/20 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    @click.stop="removeSource(src.id)"
                    title="移除此源"
                  >
                    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div class="mt-2 text-xs text-white/30">共 {{ totalChannels }} 个频道</div>
            </div>

            <!-- 预设源快速导入 -->
            <div class="px-5 pt-4 pb-2">
              <label class="block text-xs text-white/40 mb-2 uppercase tracking-wider">快速导入</label>
              <div class="space-y-3">
                <template v-for="group in presetGroups" :key="group.name">
                  <div>
                    <div class="text-xs text-white/30 mb-1.5">{{ group.name }}</div>
                    <div class="flex flex-wrap gap-1.5">
                      <button
                        v-for="preset in group.items"
                        :key="preset.url"
                        class="px-3 py-1.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded-lg text-xs text-white/70 hover:text-white transition-all disabled:opacity-30"
                        :disabled="loading"
                        @click="quickImport(preset.url, preset.label)"
                      >
                        {{ preset.label }}
                      </button>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- 自定义输入 -->
            <div class="px-5 pt-4 pb-6 space-y-3">
              <label class="block text-xs text-white/40 uppercase tracking-wider">或输入链接</label>
              <div class="flex gap-2">
                <input
                  v-model="customUrl"
                  type="text"
                  placeholder="https://example.com/playlist.m3u"
                  class="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-white/20 outline-none transition-all focus:border-white/30 text-xs"
                  @keydown.enter="quickImport(customUrl, customUrl)"
                />
                <button
                  class="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-medium transition-all disabled:opacity-30 flex-shrink-0"
                  :disabled="loading || !customUrl.trim()"
                  @click="quickImport(customUrl, customUrl)"
                >
                  导入
                </button>
              </div>
              <!-- 加载状态 -->
              <div v-if="loading" class="flex items-center gap-2 text-xs text-white/40">
                <div class="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin"></div>
                加载中...
              </div>
              <!-- 错误提示 -->
              <div v-if="error" class="text-xs text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{{ error }}</div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { loadM3USource } from '../utils/m3uParser.js'
import { getPresetChannels } from '../utils/presetCache.js'
import { presets } from '../utils/presets.js'

const props = defineProps({
  visible: Boolean,
  sources: { type: Array, default: () => [] },
  channels: { type: Array, default: () => [] },
  totalChannels: { type: Number, default: 0 },
})

const emit = defineEmits(['import', 'close', 'remove-source', 'switch-source'])

const presetGroups = computed(() => {
  const map = new Map()
  for (const p of presets) {
    if (!map.has(p.group)) map.set(p.group, [])
    map.get(p.group).push(p)
  }
  return Array.from(map.entries()).map(([name, items]) => ({ name, items }))
})

// ===== 状态 =====
const customUrl = ref('')
const loading = ref(false)
const error = ref('')

// ===== 一键导入（带 IndexedDB 缓存） =====
async function quickImport(url, label) {
  if (!url) return
  loading.value = true
  error.value = ''

  try {
    const { channels } = await getPresetChannels(url, async (fetchUrl) => {
      return await loadM3USource(fetchUrl)
    })
    if (!channels || channels.length === 0) {
      error.value = '未识别到有效频道'
      return
    }
    // 直接 emit，父组件处理导入 + 关闭面板 + 自动播放
    emit('import', channels, { url, label: label || url })
  } catch (e) {
    error.value = `加载失败: ${e.message}`
  } finally {
    loading.value = false
  }
}

function removeSource(id) {
  emit('remove-source', id)
}

function switchSource(id) {
  emit('switch-source', id)
  close()
}

function getSourceChannelCount(id) {
  // 聚合模式：统计有该源线路的频道数
  const count = props.channels.filter(c => c.urls && c.urls.some(u => u.sourceId === id)).length
  return count || '—'
}

function close() {
  emit('close')
}
</script>

<style scoped>
.import-slide-enter-active {
  animation: importIn 0.25s ease-out;
}
.import-slide-leave-active {
  animation: importOut 0.2s ease-in;
}
@keyframes importIn {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
@keyframes importOut {
  from { transform: translateX(0); opacity: 1; }
  to { transform: translateX(100%); opacity: 0; }
}
</style>
