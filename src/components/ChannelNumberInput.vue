<template>
  <Transition name="number-input">
    <div
      v-if="visible && digits.length > 0"
      class="absolute bottom-32 right-8 z-50"
    >
      <div class="flex items-center gap-2 bg-black/80 backdrop-blur-xl rounded-2xl px-6 py-4 border border-white/10 shadow-2xl">
        <!-- 输入的数字 -->
        <div class="flex items-center gap-1">
          <span
            v-for="(d, i) in paddedDigits"
            :key="i"
            class="w-10 h-12 flex items-center justify-center text-3xl font-bold rounded-lg transition-all duration-200"
            :class="i < digits.length
              ? 'bg-white/15 text-white'
              : 'bg-white/[0.03] text-white/20'"
          >{{ d }}</span>
        </div>

        <!-- 提示 -->
        <div class="ml-3 text-lg text-white/30">
          跳转频道
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: { type: Boolean, default: false },
  digits: { type: String, default: '' },
})

// 补齐到 3 位显示
const paddedDigits = computed(() => {
  const arr = props.digits.split('')
  while (arr.length < 3) arr.push('—')
  return arr
})
</script>

<style scoped>
.number-input-enter-active {
  animation: inputIn 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.number-input-leave-active {
  animation: inputOut 0.15s ease-in;
}
@keyframes inputIn {
  from { transform: translateY(10px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
@keyframes inputOut {
  from { transform: translateY(0); opacity: 1; }
  to { transform: translateY(10px); opacity: 0; }
}
</style>
