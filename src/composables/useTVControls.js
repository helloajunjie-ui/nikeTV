import { ref, onMounted, onBeforeUnmount } from 'vue'

/**
 * 电视遥控器控制系统
 *
 * 统一管理键盘/遥控器按键映射，替代旧的 useGesture.js。
 * 与 useTVNavigation.js 配合使用。
 *
 * 按键映射（电视遥控器优化）：
 *   ArrowUp      → 上一个频道 / 焦点上移
 *   ArrowDown    → 下一个频道 / 焦点下移
 *   ArrowLeft    → 音量 -5% / 切换分组（左）
 *   ArrowRight   → 音量 +5% / 切换分组（右）
 *   Enter        → 显示/隐藏 HUD / 确认选择
 *   Back/Escape  → 关闭面板 / 返回
 *   0-9          → 频道号快速跳转
 *   PageUp       → 音量 +10%
 *   PageDown     → 音量 -10%
 *
 * 触摸手势（手机/平板兼容）：
 *   左右滑动 → 切换频道
 *   左侧上下 → 亮度调节
 *   右侧上下 → 音量调节
 */
export function useTVControls({
  // 频道控制
  onPrevChannel,
  onNextChannel,
  // 音量控制
  onVolumeUp,
  onVolumeDown,
  // 焦点导航（由 useTVNavigation 提供）
  onFocusPrev,
  onFocusNext,
  onFocusLeft,
  onFocusRight,
  onEnter,
  onBack,
  // 分组切换
  onPrevGroup,
  onNextGroup,
  // 数字键
  onDigit,
  // 触摸手势
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
} = {}) {
  // ===== 音量状态 =====
  const volume = ref(1)
  const brightness = ref(100)

  // ===== 交互模式 =====
  // 'default' | 'channel-list' | 'epg' | 'number-input'
  const interactionMode = ref('default')

  function setMode(mode) {
    interactionMode.value = mode
  }

  // ===== 数字键输入 =====
  const digitBuffer = ref('')
  let digitTimer = null

  function handleDigit(digit) {
    // 如果不在数字输入模式，切换到数字输入模式
    if (interactionMode.value !== 'number-input') {
      interactionMode.value = 'number-input'
    }
    // 最多 3 位数字
    if (digitBuffer.value.length >= 3) {
      digitBuffer.value = digit
    } else {
      digitBuffer.value += digit
    }
    // 触发数字输入回调
    onDigit?.(digitBuffer.value)
    // 3 秒无输入自动清除
    clearTimeout(digitTimer)
    digitTimer = setTimeout(() => {
      digitBuffer.value = ''
      if (interactionMode.value === 'number-input') {
        interactionMode.value = 'default'
      }
    }, 3000)
  }

  function clearDigitBuffer() {
    digitBuffer.value = ''
    clearTimeout(digitTimer)
    if (interactionMode.value === 'number-input') {
      interactionMode.value = 'default'
    }
  }

  // ===== 键盘事件处理 =====
  function onKeyDown(e) {
    const mode = interactionMode.value

    // 数字键（所有模式下都可用，但输入框聚焦时不触发）
    if (e.key >= '0' && e.key <= '9' && !isInputFocused()) {
      e.preventDefault()
      handleDigit(e.key)
      return
    }

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        if (mode === 'channel-list' || mode === 'epg') {
          onFocusPrev?.()
        } else {
          onPrevChannel?.()
        }
        break

      case 'ArrowDown':
        e.preventDefault()
        if (mode === 'channel-list' || mode === 'epg') {
          onFocusNext?.()
        } else {
          onNextChannel?.()
        }
        break

      case 'ArrowLeft':
        e.preventDefault()
        if (mode === 'channel-list') {
          onPrevGroup?.()
        } else if (mode === 'epg') {
          onFocusLeft?.()
        } else {
          onVolumeDown?.()
          volume.value = Math.max(0, +(volume.value - 0.05).toFixed(2))
        }
        break

      case 'ArrowRight':
        e.preventDefault()
        if (mode === 'channel-list') {
          onNextGroup?.()
        } else if (mode === 'epg') {
          onFocusRight?.()
        } else {
          onVolumeUp?.()
          volume.value = Math.min(1, +(volume.value + 0.05).toFixed(2))
        }
        break

      case 'Enter':
        e.preventDefault()
        // 输入框聚焦时不处理 Enter（避免干扰文本输入）
        if (isInputFocused()) return
        onEnter?.()
        break

      case 'Escape':
        e.preventDefault()
        // 如果在数字输入模式，先清除数字
        if (mode === 'number-input') {
          clearDigitBuffer()
          return
        }
        onBack?.()
        break

      case 'PageUp':
        e.preventDefault()
        onVolumeUp?.()
        volume.value = Math.min(1, +(volume.value + 0.1).toFixed(2))
        break

      case 'PageDown':
        e.preventDefault()
        onVolumeDown?.()
        volume.value = Math.max(0, +(volume.value - 0.1).toFixed(2))
        break
    }
  }

  // ===== 判断当前是否有输入框聚焦 =====
  function isInputFocused() {
    const active = document.activeElement
    if (!active) return false
    return active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable
  }

  // ===== 触摸手势（保留手机兼容） =====
  let touchStartX = 0
  let touchStartY = 0
  let touchStartTime = 0
  let isTracking = false
  let gestureZone = ''
  let isVerticalDrag = false

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
    isVerticalDrag = false
  }

  function onTouchMove(e) {
    if (!isTracking) return
    const touch = e.touches[0]
    const deltaX = touch.clientX - touchStartX
    const deltaY = touch.clientY - touchStartY

    if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 10) {
      e.preventDefault()
      isVerticalDrag = true
      touchStartX = touch.clientX
      touchStartY = touch.clientY
      touchStartTime = Date.now()
      const factor = -deltaY / window.innerHeight

      if (gestureZone === 'left') {
        brightness.value = Math.max(10, Math.min(150, 100 + factor * 100))
      } else {
        volume.value = Math.max(0, Math.min(1, 1 + factor))
      }
    }
  }

  function onTouchEnd(e) {
    if (!isTracking) return
    isTracking = false
    if (isVerticalDrag) return

    const touch = e.changedTouches[0]
    const deltaX = touch.clientX - touchStartX
    const deltaY = touch.clientY - touchStartY
    const elapsed = Date.now() - touchStartTime

    if (elapsed < SWIPE_TIME_MAX && Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX > 0) {
        onSwipeRight?.()
      } else {
        onSwipeLeft?.()
      }
    }
  }

  // ===== 生命周期 =====
  let cleanup = () => {}

  onMounted(() => {
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd, { passive: true })

    cleanup = () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove', onTouchMove)
      document.removeEventListener('touchend', onTouchEnd)
      clearTimeout(digitTimer)
    }
  })

  onBeforeUnmount(() => {
    cleanup()
  })

  return {
    volume,
    brightness,
    interactionMode,
    digitBuffer,
    setMode,
    clearDigitBuffer,
  }
}
