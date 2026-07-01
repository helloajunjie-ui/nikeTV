import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 手机端手势控制
 * - 左侧上下滑动：调节亮度 (CSS filter)
 * - 右侧上下滑动：调节音量 (Web Audio API)
 * - 左右滑动：切换频道
 * 
 * 键盘映射（电视/桌面）：
 * - 上下键：切换频道（← → 在电视遥控器上通常用于音量）
 * - 左右键：调节音量
 */
export function useGesture({ onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown }) {
  const brightness = ref(100)
  const volume = ref(1)

  // 触摸状态
  let touchStartX = 0
  let touchStartY = 0
  let touchStartTime = 0
  let isTracking = false
  let gestureZone = '' // 'left' | 'right'

  const SWIPE_THRESHOLD = 50
  const SWIPE_TIME_MAX = 300

  function getTouchZone(x) {
    return x < window.innerWidth / 2 ? 'left' : 'right'
  }

  function onTouchStart(e) {
    const touch = e.touches[0]
    touchStartX = touch.clientX
    touchStartY = touch.clientY
    touchStartTime = Date.now()
    gestureZone = getTouchZone(touch.clientX)
    isTracking = true
  }

  function onTouchMove(e) {
    if (!isTracking) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartX
    const deltaY = touch.clientY - touchStartY

    // 垂直滑动：亮度/音量调节
    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      e.preventDefault()
      const factor = -deltaY / window.innerHeight

      if (gestureZone === 'left') {
        // 左侧：亮度
        brightness.value = Math.max(10, Math.min(150, 100 + factor * 100))
      } else {
        // 右侧：音量
        volume.value = Math.max(0, Math.min(1, 1 + factor))
      }
    }
  }

  function onTouchEnd(e) {
    if (!isTracking) return
    isTracking = false

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartX
    const deltaY = touch.clientY - touchStartY
    const elapsed = Date.now() - touchStartTime

    // 快速滑动切换频道
    if (elapsed < SWIPE_TIME_MAX && Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        onSwipeRight?.()
      } else {
        onSwipeLeft?.()
      }
    }
  }

  // 键盘/遥控器支持
  // 映射规则（统一方向语义）：
  //   ArrowUp      → 上一个频道 (prevChannel)
  //   ArrowDown    → 下一个频道 (nextChannel)
  //   ArrowLeft    → 上一个频道 (prevChannel)
  //   ArrowRight   → 下一个频道 (nextChannel)
  //   PageUp       → 音量增大
  //   PageDown     → 音量减小
  //
  // 设计说明：电视遥控器的方向键通常用于频道切换（上下左右都是切台），
  // 音量通过独立按键控制。这里用 PageUp/PageDown 替代左右键调音量，
  // 避免与频道切换的方向语义冲突。
  function onKeyDown(e) {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        e.preventDefault()
        onSwipeUp?.()
        break
      case 'ArrowDown':
      case 'ArrowRight':
        e.preventDefault()
        onSwipeDown?.()
        break
      case 'PageUp':
        e.preventDefault()
        // 音量加 0.05
        volume.value = Math.min(1, +(volume.value + 0.05).toFixed(2))
        break
      case 'PageDown':
        e.preventDefault()
        // 音量减 0.05
        volume.value = Math.max(0, +(volume.value - 0.05).toFixed(2))
        break
    }
  }

  let cleanup = () => {}

  onMounted(() => {
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })
    document.addEventListener('keydown', onKeyDown)

    cleanup = () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      document.removeEventListener('keydown', onKeyDown)
    }
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  return {
    brightness,
    volume,
  }
}
