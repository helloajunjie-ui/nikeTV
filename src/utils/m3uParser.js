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
 *
 * 安全设计：
 * - 脏数据过滤：剔除被 User-Agent 污染的频道名
 * - 频道数熔断：最多解析 1000 个频道，保护设备内存
 */

const MAX_CHANNELS = 1000

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

    // 跳过文件头
    if (trimmed.startsWith('#EXTM3U')) continue

    // 解析频道元信息
    if (trimmed.startsWith('#EXTINF:')) {
      currentMeta = parseExtInf(trimmed)

      // 脏数据拦截：名字太长或包含 UA 标识 → 丢弃
      if (currentMeta && isDirtyName(currentMeta.name)) {
        currentMeta = null
      }
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
      // 只接受 http/https 开头的合法 URL
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        channels.push({
          ...currentMeta,
          url: trimmed,
        })
      }
      currentMeta = null
    }

    // 频道数熔断：最多 1000 个
    if (channels.length >= MAX_CHANNELS) {
      console.warn(`[m3u] 频道数量超过 ${MAX_CHANNELS}，已自动截断`)
      break
    }
  }

  return channels
}

/**
 * 判断频道名是否为脏数据
 * 脏数据特征：包含浏览器 UA 标识、过长、或明显是爬虫错误拼接
 */
function isDirtyName(name) {
  if (!name) return true
  // 包含浏览器 UA 标识
  if (/Mozilla|Chrome\/|Safari\/|Gecko|AppleWebKit|KHTML/i.test(name)) return true
  // 名字过长（正常频道名一般不超过 30 个字符）
  if (name.length > 40) return true
  return false
}

/**
 * 解析 #EXTINF 标签
 * 兼容两种格式：
 *   格式1: #EXTINF:-1 tvg-id="cctv1" tvg-name="CCTV1" tvg-logo="http://logo.png" group-title="央视",CCTV-1 综合
 *   格式2: #EXTINF:-1,CCTV-1 综合（无属性）
 */
function parseExtInf(line) {
  const meta = { name: '未知频道' }

  // 提取 tvg-id
  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/)
  if (tvgIdMatch && tvgIdMatch[1]) meta.tvgId = tvgIdMatch[1]

  // 提取 tvg-name
  const tvgNameMatch = line.match(/tvg-name="([^"]*)"/)
  if (tvgNameMatch && tvgNameMatch[1]) meta.tvgName = tvgNameMatch[1]

  // 提取 tvg-logo
  const logoMatch = line.match(/tvg-logo="([^"]*)"/)
  if (logoMatch && logoMatch[1]) meta.logo = logoMatch[1]

  // 提取 group-title
  const groupMatch = line.match(/group-title="([^"]*)"/)
  if (groupMatch && groupMatch[1]) meta.group = groupMatch[1]

  // 提取频道名称
  const commaIndex = line.indexOf(',')
  if (commaIndex >= 0) {
    const name = line.slice(commaIndex + 1).trim()
    if (name) meta.name = name
  }

  return meta
}

/**
 * 加载 M3U 源
 * 支持 URL 和纯文本两种输入
 */
export async function loadM3USource(input) {
  // 如果是 URL，先尝试 fetch
  if (input.startsWith('http://') || input.startsWith('https://')) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(input, { signal: controller.signal })
      clearTimeout(timer)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const text = await response.text()
      if (text && text.includes('#EXTM3U')) {
        return parseM3U(text)
      }
      throw new Error('不是有效的 M3U 文件')
    } catch (e) {
      clearTimeout(timer)
      throw new Error(`无法加载源: ${e.message}`)
    }
  }

  // 否则当作纯文本解析
  return parseM3U(input)
}
