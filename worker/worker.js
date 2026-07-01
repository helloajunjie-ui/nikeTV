/**
 * NikoTV - Cloudflare Worker CORS 代理
 *
 * 职责：仅代理 HTTP 直播流（通过 ?url= 参数），解决 Mixed Content 问题
 * 前端 SPA 部署在 Cloudflare Pages（同仓库，dist/ 目录）
 *
 * 部署方式：
 *   cd worker && wrangler deploy
 *
 * 前端调用：
 *   https://你的worker域名/?url=https://原始直播流地址.m3u8
 *
 * 环境变量：
 *   PROXY_SECRET  - 可选，设置后前端需传 ?secret=xxx 才能使用
 *   MAX_RESPONSE_SIZE - 可选，响应体最大字节数（默认 50MB）
 */

const DEFAULT_MAX_SIZE = 50 * 1024 * 1024 // 50MB

export default {
  async fetch(request) {
    const url = new URL(request.url)

    // ── CORS 预检 ──
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() })
    }

    // ── 健康检查 ──
    if (url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'NikoTV Proxy' }), {
        headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    // ── 代理请求 ──
    const targetUrl = url.searchParams.get('url')
    if (!targetUrl) {
      return jsonResponse({ error: 'Proxy only. Use ?url= parameter.' }, 400)
    }

    return handleProxy(url, targetUrl, request)
  },
}

async function handleProxy(url, targetUrl, request) {
  // 安全校验
  try {
    const parsed = new URL(targetUrl)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return jsonResponse({ error: 'Invalid protocol' }, 400)
    }
  } catch {
    return jsonResponse({ error: 'Invalid URL' }, 400)
  }

  // 可选鉴权
  const secret = url.searchParams.get('secret')
  const expectedSecret = typeof PROXY_SECRET !== 'undefined' ? PROXY_SECRET : null
  if (expectedSecret && secret !== expectedSecret) {
    return jsonResponse({ error: 'Unauthorized' }, 403)
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    const modifiedRequest = new Request(targetUrl, {
      method: request.method,
      headers: filterHopByHopHeaders(request.headers),
      body: request.method !== 'GET' && request.method !== 'HEAD' ? request.body : null,
      signal: controller.signal,
      redirect: 'manual',
    })

    let response = await fetch(modifiedRequest)
    clearTimeout(timeoutId)

    // 处理重定向
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('Location')
      if (location) {
        response = await fetch(location, {
          method: request.method,
          headers: filterHopByHopHeaders(request.headers),
          signal: controller.signal,
        })
      }
    }

    // 构建响应头
    const newHeaders = new Headers(response.headers)
    Object.entries(corsHeaders()).forEach(([k, v]) => newHeaders.set(k, v))
    fixContentType(newHeaders, targetUrl)

    // M3U8 相对路径重写
    if (targetUrl.includes('.m3u8') && response.ok) {
      const originalText = await response.text()
      const baseUrl = targetUrl.substring(0, targetUrl.lastIndexOf('/') + 1)
      const proxyBase = `${url.origin}${url.pathname}?url=`

      const rewritten = originalText.split('\n').map(line => {
        const trimmed = line.trim()
        if (trimmed.startsWith('#') || trimmed === '' ||
            trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          return line
        }
        const absoluteUrl = new URL(trimmed, baseUrl).href
        return line.replace(trimmed, `${proxyBase}${encodeURIComponent(absoluteUrl)}`)
      }).join('\n')

      return new Response(rewritten, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      })
    }

    // 流式响应
    const maxSize = parseInt(
      typeof MAX_RESPONSE_SIZE !== 'undefined' ? MAX_RESPONSE_SIZE : DEFAULT_MAX_SIZE, 10
    )

    if (response.body) {
      const contentType = newHeaders.get('Content-Type') || ''
      const isStreamable = contentType.includes('video') ||
                           contentType.includes('audio') ||
                           contentType.includes('octet-stream') ||
                           targetUrl.includes('.ts') ||
                           targetUrl.includes('.m4s')

      if (isStreamable) {
        const { readable, writable } = new TransformStream()
        const writer = writable.getWriter()
        const reader = response.body.getReader()
        let totalSize = 0

        ;(async () => {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) { await writer.close(); break }
              totalSize += value.byteLength
              if (totalSize > maxSize) { reader.cancel(); writer.abort(new Error('Response too large')); break }
              await writer.write(value)
            }
          } catch (e) {
            try { writer.abort(e) } catch {}
          }
        })()

        return new Response(readable, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        })
      }

      // 非流式内容
      const reader = response.body.getReader()
      let size = 0
      const chunks = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > maxSize) { reader.cancel(); return jsonResponse({ error: 'Response too large' }, 413) }
        chunks.push(value)
      }
      const body = new Uint8Array(size)
      let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
      return new Response(body, { status: response.status, statusText: response.statusText, headers: newHeaders })
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    })

  } catch (err) {
    if (err.name === 'AbortError') {
      return jsonResponse({ error: 'Request timeout' }, 504)
    }
    return jsonResponse({ error: err.message }, 502)
  }
}

// ── 工具函数 ──

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type, Origin, Accept',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
    'Access-Control-Max-Age': '86400',
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  })
}

function fixContentType(headers, targetUrl) {
  const contentType = headers.get('Content-Type') || ''
  if (targetUrl.includes('.m3u8') && !contentType.includes('application')) {
    headers.set('Content-Type', 'application/vnd.apple.mpegurl')
  } else if (targetUrl.includes('.ts') && !contentType.includes('video')) {
    headers.set('Content-Type', 'video/MP2T')
  }
}

function filterHopByHopHeaders(headers) {
  const hopByHop = [
    'connection', 'keep-alive', 'proxy-authenticate',
    'proxy-authorization', 'te', 'trailers',
    'transfer-encoding', 'upgrade',
  ]
  const filtered = new Headers()
  for (const [key, value] of headers) {
    if (!hopByHop.includes(key.toLowerCase())) {
      filtered.set(key, value)
    }
  }
  return filtered
}
