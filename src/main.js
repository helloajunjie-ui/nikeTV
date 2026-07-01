import { createApp } from 'vue'
import './style.css'
import App from './App.vue'

// ===== PWA Service Worker 注册 + 优雅更新机制 =====
// 防止"幽灵缓存"：用户永远看到旧版，而开发者以为已更新
if ('serviceWorker' in navigator) {
  // 开发环境下：强制清除所有旧 SW 和缓存，确保每次加载都是最新代码
  if (import.meta.env.DEV) {
    (async () => {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map(reg => reg.unregister()))
      const cacheKeys = await caches.keys()
      await Promise.all(cacheKeys.map(key => caches.delete(key)))
      const registration = await navigator.serviceWorker.register('/sw.js')
      console.log('SW 注册成功:', registration.scope)
      if (registration.installing) {
        registration.installing.addEventListener('statechange', () => {
          if (registration.active) {
            window.location.reload()
          }
        })
      }
    })()
  } else {
    // 生产环境：标准注册流程
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').then(
        (registration) => {
          console.log('SW 注册成功:', registration.scope)

          // 监听新版本就绪
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (!newWorker) return

            newWorker.addEventListener('statechange', () => {
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast(registration)
              }
            })
          })
        },
        (err) => {
          console.warn('SW 注册失败:', err)
        }
      )
    })
  }
}

/**
 * 显示"新版本就绪"提示条
 * 极简设计：底部细长条，不打断用户观看
 */
function showUpdateToast(registration) {
  const toast = document.createElement('div')
  toast.id = 'nikotv-update-toast'
  toast.innerHTML = `
    <span>NikoTV 新版本已就绪</span>
    <button id="nikotv-update-btn">刷新</button>
  `
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '9999',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '10px 20px',
    background: 'rgba(255,255,255,0.08)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    color: 'rgba(255,255,255,0.8)',
    fontSize: '14px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    animation: 'slideUp 0.3s ease-out',
    cursor: 'default',
  })

  const btn = toast.querySelector('#nikotv-update-btn')
  Object.assign(btn.style, {
    padding: '6px 16px',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '8px',
    color: 'white',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'background 0.2s',
  })
  btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.25)' }
  btn.onmouseleave = () => { btn.style.background = 'rgba(255,255,255,0.15)' }
  btn.onclick = () => {
    registration.waiting?.postMessage({ type: 'SKIP_WAITING' })
    window.location.reload()
  }

  document.body.appendChild(toast)

  // 10 秒后自动消失
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s'
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(-50%) translateY(20px)'
    setTimeout(() => toast.remove(), 300)
  }, 10000)
}

createApp(App).mount('#app')
