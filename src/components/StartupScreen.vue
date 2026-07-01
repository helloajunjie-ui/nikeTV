<template>
  <Transition name="startup-leave">
    <div
      v-if="visible"
      class="absolute inset-0 z-50 flex flex-col items-center justify-center bg-black"
    >
      <!-- Logo 动画 -->
      <div class="relative mb-8">
        <!-- 外圈光晕 -->
        <div class="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/20 via-purple-500/10 to-transparent blur-3xl animate-pulse-slow"></div>
        <!-- Logo 图标 -->
        <div class="relative w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-500/30 to-purple-600/30 border border-white/10 flex items-center justify-center animate-logo-enter">
          <svg class="w-12 h-12 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      </div>

      <!-- 标题 -->
      <h1 class="text-5xl font-bold text-white/90 tracking-wide mb-2 animate-title-enter">
        NikoTV
      </h1>
      <p class="text-xl text-white/30 mb-12 animate-subtitle-enter">纯净流媒体播放器</p>

      <!-- 加载进度 -->
      <div class="w-48 flex flex-col items-center gap-3">
        <div class="w-full h-1 bg-white/10 rounded-full overflow-hidden">
          <div
            class="h-full bg-gradient-to-r from-blue-400/60 to-purple-400/60 rounded-full transition-all duration-500 ease-out"
            :style="{ width: progress + '%' }"
          ></div>
        </div>
        <span class="text-sm text-white/30 font-mono">
          {{ statusText }}
        </span>
      </div>

      <!-- 版本号 -->
      <div class="absolute bottom-12 text-xs text-white/10">
        v1.0.0
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: true },
  progress: { type: Number, default: 0 },
  statusText: { type: String, default: '加载中...' },
})

defineEmits(['loaded'])
</script>

<style scoped>
/* ===== Logo 进入动画 ===== */
.animate-logo-enter {
  animation: logoBounce 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  opacity: 0;
  transform: scale(0.5);
}
@keyframes logoBounce {
  0% { opacity: 0; transform: scale(0.5); }
  60% { transform: scale(1.1); }
  100% { opacity: 1; transform: scale(1); }
}

/* ===== 标题淡入 ===== */
.animate-title-enter {
  animation: fadeUp 0.5s ease-out 0.3s both;
}
.animate-subtitle-enter {
  animation: fadeUp 0.5s ease-out 0.5s both;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ===== 脉冲光晕 ===== */
.animate-pulse-slow {
  animation: pulseGlow 3s ease-in-out infinite;
}
@keyframes pulseGlow {
  0%, 100% { opacity: 0.3; transform: scale(1); }
  50% { opacity: 0.6; transform: scale(1.2); }
}

/* ===== 离开过渡 ===== */
.startup-leave-enter-active { transition: none; }
.startup-leave-leave-active {
  transition: opacity 0.4s ease-out, transform 0.4s ease-out;
}
.startup-leave-leave-to {
  opacity: 0;
  transform: scale(1.05);
}
</style>
