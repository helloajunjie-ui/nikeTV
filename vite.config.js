import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      // 代理 M3U 源请求，避免 CORS 限制
      '/m3u-proxy': {
        target: 'https://raw.githubusercontent.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/m3u-proxy/, ''),
        configure: (proxy) => {
          proxy.on('error', (err) => {
            console.error('[m3u-proxy] 代理错误:', err.message)
          })
        },
      },
    },
  },
})
