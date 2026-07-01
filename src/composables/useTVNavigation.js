import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

/**
 * TV 遥控器焦点导航系统
 *
 * 管理可聚焦元素列表，支持方向键导航。
 * 与 useTVControls.js 配合使用：useTVControls 处理按键映射，
 * useTVNavigation 处理焦点状态管理。
 *
 * 使用方式：
 *   const nav = useTVNavigation()
 *   // 在模板中：:ref="nav.register"
 *   // 或手动设置：nav.setFocusables([...elements])
 */
export function useTVNavigation() {
  // ===== 状态 =====
  const focusables = ref([])       // 可聚焦元素数组
  const focusIndex = ref(0)        // 当前焦点索引
  const focusId = ref('')          // 当前焦点元素的标识（用于 v-for 场景）

  // ===== 计算属性 =====
  const currentFocus = computed(() => focusables.value[focusIndex.value] || null)
  const hasFocus = computed(() => focusables.value.length > 0)
  const totalFocusables = computed(() => focusables.value.length)

  // ===== 注册元素 =====
  // 用于模板中 :ref="nav.register"
  const registeredElements = []
  let registerCounter = 0

  function register(el) {
    if (!el) return
    // 避免重复注册
    const idx = registeredElements.indexOf(el)
    if (idx >= 0) return
    registeredElements.push(el)
    // 自动重建 focusables
    rebuildFocusables()
  }

  function unregister(el) {
    const idx = registeredElements.indexOf(el)
    if (idx >= 0) {
      registeredElements.splice(idx, 1)
      rebuildFocusables()
    }
  }

  function rebuildFocusables() {
    focusables.value = [...registeredElements]
    // 修正索引
    if (focusIndex.value >= focusables.value.length) {
      focusIndex.value = Math.max(0, focusables.value.length - 1)
    }
  }

  // ===== 手动设置焦点列表 =====
  function setFocusables(elements, initialIndex = 0) {
    focusables.value = elements
    focusIndex.value = Math.min(initialIndex, Math.max(0, elements.length - 1))
    applyFocus()
  }

  // ===== 焦点导航 =====
  function focusNext() {
    if (focusables.value.length === 0) return false
    focusIndex.value = (focusIndex.value + 1) % focusables.value.length
    applyFocus()
    return true
  }

  function focusPrev() {
    if (focusables.value.length === 0) return false
    focusIndex.value = (focusIndex.value - 1 + focusables.value.length) % focusables.value.length
    applyFocus()
    return true
  }

  function focusAt(index) {
    if (index < 0 || index >= focusables.value.length) return false
    focusIndex.value = index
    applyFocus()
    return true
  }

  function focusById(id) {
    const idx = focusables.value.findIndex(el => el.dataset?.focusId === id)
    if (idx >= 0) {
      focusIndex.value = idx
      applyFocus()
      return true
    }
    return false
  }

  // ===== 应用焦点 =====
  function applyFocus() {
    const el = currentFocus.value
    if (!el) return
    // 先清除所有焦点
    for (const f of focusables.value) {
      f.classList?.remove('tv-focus')
      f.removeAttribute?.('tv-focused')
    }
    // 设置当前焦点
    el.classList?.add('tv-focus')
    el.setAttribute?.('tv-focused', '')
    el.focus?.({ preventScroll: false })
    el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
  }

  // ===== 重置 =====
  function resetFocus() {
    focusIndex.value = 0
    applyFocus()
  }

  // ===== 清理 =====
  function cleanup() {
    for (const f of focusables.value) {
      f.classList?.remove('tv-focus')
      f.removeAttribute?.('tv-focused')
    }
    focusables.value = []
    registeredElements.length = 0
    focusIndex.value = 0
  }

  return {
    // 状态
    focusables,
    focusIndex,
    focusId,
    currentFocus,
    hasFocus,
    totalFocusables,
    // 注册
    register,
    unregister,
    setFocusables,
    // 导航
    focusNext,
    focusPrev,
    focusAt,
    focusById,
    applyFocus,
    resetFocus,
    cleanup,
  }
}
