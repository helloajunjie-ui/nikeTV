/**
 * m3u 直播源解析器
 * 支持标准 m3u8 格式，兼容 EXTINF 标签
 * 
 * 输入格式示例：
 * #EXTM3U
 * #EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV1" tvg-logo="http://logo.png",CCTV-1 综合
 * http://example.com/stream.m3u8
 * 
 * 输出：{ name, logo, url, tvgId, group }
 */

/**
 * 解析 m3u 内容为频道列表
 * @param {string} content - m3u 文件内容
 * @returns {Array<{name: string, url: string, logo?: string, tvgId?: string, group?: string}>}
 */
export function parseM3U(content) {
  // 统一换行符
  const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const lines = normalized.split('\n')
  const channels = []
  let currentMeta = null

  for (const line of lines) {
    const trimmed = line.trim()
    
    // 跳过空行
    if (!trimmed) continue

    // 跳过文件头（兼容 #EXTM3U 带参数的情况）
    if (trimmed.startsWith('#EXTM3U')) continue

    // 解析频道元信息
    if (trimmed.startsWith('#EXTINF:')) {
      currentMeta = parseExtInf(trimmed)
      continue
    }

    // 解析频道分组
    if (trimmed.startsWith('#EXTGRP:')) {
      if (currentMeta) {
        currentMeta.group = trimmed.replace('#EXTGRP:', '').trim()
      }
      continue
    }

    // 跳过其他注释行
    if (trimmed.startsWith('#')) continue

    // 解析 URL
    if (currentMeta && trimmed) {
      channels.push({
        ...currentMeta,
        url: trimmed,
      })
      currentMeta = null
    }
  }

  return channels
}

/**
 * 解析 #EXTINF 标签
 * 兼容两种格式：
 *   格式1: #EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV1" tvg-logo="http://logo.png" group-title="央视",CCTV-1 综合
 *   格式2: #EXTINF:-1,CCTV-1 综合（无属性）
 */
function parseExtInf(line) {
  const meta = { name: '未知频道' }

  // 提取 tvg-id（只保留非空值）
  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/)
  if (tvgIdMatch && tvgIdMatch[1]) meta.tvgId = tvgIdMatch[1]

  // 提取 tvg-name
  const tvgNameMatch = line.match(/tvg-name="([^"]*)"/)
  if (tvgNameMatch && tvgNameMatch[1]) meta.tvgName = tvgNameMatch[1]

  // 提取 tvg-logo（只保留非空值）
  const logoMatch = line.match(/tvg-logo="([^"]*)"/)
  if (logoMatch && logoMatch[1]) meta.logo = logoMatch[1]

  // 提取 group-title（只保留非空值）
  const groupMatch = line.match(/group-title="([^"]*)"/)
  if (groupMatch && groupMatch[1]) meta.group = groupMatch[1]

  // 提取频道名称：找到第一个逗号，取其后所有内容
  // 兼容 #EXTINF:-1,频道名（无属性）和 #EXTINF:-1 attr="val",频道名 两种格式
  const commaIndex = line.indexOf(',')
  if (commaIndex >= 0) {
    const name = line.slice(commaIndex + 1).trim()
    if (name) meta.name = name
  }

  return meta
}

/**
 * 判断当前是否为 Vite 开发环境
 */
function isDev() {
  return location.hostname === 'localhost' || location.hostname === '127.0.0.1'
}

/**
 * 将 GitHub RAW URL 转换为 Vite 代理路径（开发环境）
 * 避免浏览器跨域 CORS 限制
 */
function proxyUrl(input) {
  if (!isDev()) return input
  // 只代理 GitHub RAW 的请求
  if (input.includes('raw.githubusercontent.com')) {
    const path = input.replace('https://raw.githubusercontent.com', '')
    return `/m3u-proxy${path}`
  }
  return input
}

export async function loadM3USource(input) {
  // 如果是 URL，先尝试 fetch
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const attempts = []

    if (input.startsWith('https://')) {
      // HTTPS 源：先通过 Vite 代理（开发环境）或直连（生产环境）
      attempts.push(proxyUrl(input))
      // GitHub RAW fallback：gh-proxy.com（也走代理）
      if (input.includes('raw.githubusercontent.com') || input.includes('github.com')) {
        const ghProxy = `https://gh-proxy.com/${input.replace('https://', '')}`
        attempts.push(proxyUrl(ghProxy))
      }
    } else {
      // HTTP 源：走公共 CORS 代理
      attempts.push(`https://corsproxy.io/?${encodeURIComponent(input)}`)
      attempts.push(`https://api.allorigins.win/raw?url=${encodeURIComponent(input)}`)
    }

    for (const url of attempts) {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      try {
        const response = await fetch(url, { signal: controller.signal })
        clearTimeout(timer)
        if (!response.ok) continue
        const text = await response.text()
        if (text && text.includes('#EXTM3U')) {
          return parseM3U(text)
        }
      } catch {
        clearTimeout(timer)
        continue
      }
    }

    throw new Error('无法加载源: 所有连接方式均失败')
  }

  // 否则当作纯文本解析
  return parseM3U(input)
}
