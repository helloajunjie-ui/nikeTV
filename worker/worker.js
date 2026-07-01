/**
 * NikoTV - Cloudflare Worker 流媒体代理 (带 M3U8 重写引擎)
 *
 * 职责：代理 HTTP/HTTPS 直播流（通过 ?url= 参数）
 * 前端 SPA 部署在 Cloudflare Pages（同仓库，dist/ 目录）
 *
 * 核心设计：
 * - 拦截 OPTIONS 预检，解决跨域
 * - 强制 User-Agent 伪装，避免被源站拦截
 * - M3U8 重写引擎：将 .m3u8 内的所有 .ts 分片/子列表/加密密钥 URL 全部绑定到 Worker 代理链路
 * - 非 M3U8 内容（TS 分片等）直接透传二进制流
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Range, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
}

export default {
  async fetch(request) {
    // ── 1. OPTIONS 预检 ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS })
    }

    const url = new URL(request.url)

    // ── 2. 健康检查 ──
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', worker: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      })
    }

    // ── 3. 核心代理 ──
    const targetUrl = url.searchParams.get('url')
    if (!targetUrl) {
      return new Response('Missing ?url= parameter', {
        status: 400,
        headers: CORS_HEADERS,
      })
    }

    try {
      // 安全校验
      const parsed = new URL(targetUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return new Response('Invalid protocol', {
          status: 400,
          headers: CORS_HEADERS,
        })
      }

      // 伪装浏览器 UA
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        redirect: 'follow',
      })

      const response = await fetch(modifiedRequest)
      const responseHeaders = new Headers(response.headers)
      Object.keys(CORS_HEADERS).forEach(key => responseHeaders.set(key, CORS_HEADERS[key]))

      // ── 4. HEAD 请求特殊处理 ──
      // HEAD 请求不需要处理 body，直接返回带 CORS 的空响应
      // 避免读取 body 浪费 Worker CPU 时间
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        })
      }

      // ── 5. M3U8 重写引擎 ──
      const contentType = response.headers.get('content-type') || ''
      const isM3U8 = contentType.includes('mpegurl') ||
                     contentType.includes('x-mpegURL') ||
                     targetUrl.includes('.m3u8')

      if (isM3U8 && response.ok) {
        const m3u8Text = await response.text()
        const workerOrigin = url.origin
        const rewrittenText = rewriteM3U8(m3u8Text, targetUrl, workerOrigin)

        responseHeaders.set('Content-Type', 'application/vnd.apple.mpegurl')

        return new Response(rewrittenText, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        })
      }

      // ── 6. 非 M3U8 内容直接透传 ──
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      })

    } catch (error) {
      // 【终极兜底】上游死锁、超时或 Worker 被限流
      // 强制返回 502 并带上跨域头，防止前端报 CORS 错
      // 防火墙切断连接时不会附带 Worker 设置的 CORS 头，浏览器会直接报 CORS 错误
      // 这里确保即使上游挂了，前端也能收到带 CORS 头的错误响应
      return new Response(`Upstream Error: ${error.message}`, {
        status: 502,
        headers: CORS_HEADERS,
      })
    }
  },
}

/**
 * M3U8 重写引擎
 * 将 .m3u8 文件中的相对路径、绝对路径、加密密钥 URI 全部绑定到 Worker 代理链路
 *
 * @param {string} text - 原始 M3U8 内容
 * @param {string} baseUrl - 原始 M3U8 文件的 URL（用于解析相对路径）
 * @param {string} workerOrigin - Worker 的源地址（如 https://niketv.helloajunjie.workers.dev）
 * @returns {string} 重写后的 M3U8 内容
 */
function rewriteM3U8(text, baseUrl, workerOrigin) {
  // 计算基础路径（用于解析相对路径）
  const basePath = baseUrl.substring(0, baseUrl.lastIndexOf('/') + 1)

  return text.split('\n').map(line => {
    const trimmed = line.trim()
    if (!trimmed) return line

    // 处理携带 URI 的特殊标签（AES 加密密钥、备选流等）
    if (trimmed.startsWith('#EXT-X-KEY') || trimmed.startsWith('#EXT-X-MEDIA')) {
      return line.replace(/URI="([^"]+)"/g, (match, p1) => {
        const absoluteUrl = p1.startsWith('http') ? p1 : new URL(p1, basePath).href
        return `URI="${workerOrigin}/?url=${encodeURIComponent(absoluteUrl)}"`
      })
    }

    // 其他标签行，原样返回
    if (trimmed.startsWith('#')) return line

    // 处理视频分片（.ts）、子播放列表（.m3u8）或任何资源地址
    // 无论是相对路径还是绝对路径，全部套上 Worker 代理
    const absoluteUrl = trimmed.startsWith('http') ? trimmed : new URL(trimmed, basePath).href
    return `${workerOrigin}/?url=${encodeURIComponent(absoluteUrl)}`
  }).join('\n')
}
