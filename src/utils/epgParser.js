/**
 * EPG (Electronic Program Guide) 电子节目单解析器
 *
 * 解析标准 XMLTV 格式 (XML TV Schedule)
 * 输入示例：
 * <tv generator-info-name="EPG">
 *   <channel id="CCTV1">
 *     <display-name>CCTV-1</display-name>
 *   </channel>
 *   <programme channel="CCTV1" start="20260701080000 +0800" stop="20260701090000 +0800">
 *     <title>新闻联播</title>
 *     <desc>主要内容...</desc>
 *   </programme>
 * </tv>
 *
 * 输出：{ channelId, programmes: [{ title, desc, start, end }] }
 */

const EPG_CACHE_KEY = 'nikotv-epg-cache'
const EPG_CACHE_DURATION = 30 * 60 * 1000 // 30 分钟缓存

/**
 * tvg-id 归一化函数
 * 解决 EPG 匹配中的命名差异问题：
 *   "CCTV-1" → "cctv1"
 *   "CCTV1"  → "cctv1"
 *   "cctv-1综合" → "cctv1"
 *   "CCTV-1 高清" → "cctv1"
 *   "CHC 高清电影" → "chc高清电影"
 */
function normalizeTvgId(id) {
  if (!id) return ''
  return id
    .toLowerCase()                    // 统一小写
    .replace(/[\s\-_]+/g, '')        // 去除空格、连字符、下划线
    .replace(/[^\w\u4e00-\u9fa5]/g, '') // 只保留字母数字中文
}

/**
 * 构建 tvg-id 模糊匹配索引
 * 将 EPG 中的 channelId 展开为多个可能的匹配键：
 *   原始: "CCTV1"
 *   归一化: "cctv1"
 *   显示名: "CCTV-1" → "cctv1"
 *   显示名: "CCTV-1综合" → "cctv1综合"
 */
export function buildEpgIndex(groupedEpg) {
  const index = new Map()

  for (const [channelId, programmes] of Object.entries(groupedEpg)) {
    const normalized = normalizeTvgId(channelId)
    
    // 用归一化后的 ID 做主键
    if (!index.has(normalized)) {
      index.set(normalized, programmes)
    }

    // 如果 EPG 中有 display-name，也建立映射
    if (programmes.length > 0) {
      const displayName = programmes[0].channelName
      if (displayName && displayName !== channelId) {
        const nameNormalized = normalizeTvgId(displayName)
        if (!index.has(nameNormalized)) {
          index.set(nameNormalized, programmes)
        }
      }
    }
  }

  return index
}

/**
 * 通过 tvg-id 在 EPG 索引中查找节目单
 * 先精确匹配，再归一化模糊匹配
 */
export function findProgrammes(tvgId, epgIndex) {
  if (!tvgId || !epgIndex) return null

  // 1. 精确匹配
  if (epgIndex.has(tvgId)) return epgIndex.get(tvgId)

  // 2. 归一化匹配
  const normalized = normalizeTvgId(tvgId)
  if (epgIndex.has(normalized)) return epgIndex.get(normalized)

  // 3. 部分匹配：tvgId 包含 EPG channel 名或反之
  for (const [key, programmes] of epgIndex.entries()) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return programmes
    }
  }

  return null
}

/**
 * 解析 XMLTV 格式的 EPG 数据
 */
export function parseEPG(xmlContent) {
  const programmes = []
  const channels = new Map()

  try {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlContent, 'text/xml')

    // 解析频道映射
    const channelNodes = xmlDoc.querySelectorAll('channel')
    channelNodes.forEach(ch => {
      const id = ch.getAttribute('id')
      const name = ch.querySelector('display-name')?.textContent || id
      if (id) channels.set(id, name)
    })

    // 解析节目单
    const programmeNodes = xmlDoc.querySelectorAll('programme')
    programmeNodes.forEach(prog => {
      const channelId = prog.getAttribute('channel')
      const startStr = prog.getAttribute('start')
      const stopStr = prog.getAttribute('stop')
      const title = prog.querySelector('title')?.textContent || '未知节目'
      const desc = prog.querySelector('desc')?.textContent || ''

      if (!channelId || !startStr) return

      programmes.push({
        channelId,
        channelName: channels.get(channelId) || channelId,
        title: title.trim(),
        desc: desc.trim(),
        start: parseXMLTVDate(startStr),
        end: stopStr ? parseXMLTVDate(stopStr) : null,
      })
    })

    // 按频道分组
    const grouped = {}
    programmes.forEach(p => {
      if (!grouped[p.channelId]) grouped[p.channelId] = []
      grouped[p.channelId].push(p)
    })

    // 每个频道按时间排序
    Object.values(grouped).forEach(list => {
      list.sort((a, b) => a.start - b.start)
    })

    return grouped
  } catch (e) {
    console.warn('EPG 解析失败:', e)
    return {}
  }
}

/**
 * 解析 XMLTV 日期格式
 * "20260701080000 +0800" → Date
 */
function parseXMLTVDate(str) {
  // 格式: YYYYMMDDHHMMSS ±HHMM
  const match = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{2})(\d{2})?$/)
  if (!match) return new Date(str)

  const [, year, month, day, hour, min, sec, tzHour, tzMin = '00'] = match
  // 构造 UTC 时间
  const date = new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour) - parseInt(tzHour),
    parseInt(min) - parseInt(tzMin),
    parseInt(sec)
  ))
  return date
}

/**
 * 获取当前正在播出的节目
 * @param {Array} programmeList - 该频道的节目列表
 * @returns {{ current: object|null, next: object|null }}
 */
export function getCurrentProgramme(programmeList) {
  if (!programmeList || programmeList.length === 0) {
    return { current: null, next: null }
  }

  const now = new Date()
  let current = null
  let next = null

  for (let i = 0; i < programmeList.length; i++) {
    const prog = programmeList[i]
    const end = prog.end || (programmeList[i + 1]?.start || new Date(now.getTime() + 3600000))

    if (prog.start <= now && end > now) {
      current = prog
      next = programmeList[i + 1] || null
      break
    }

    if (prog.start > now) {
      next = prog
      break
    }
  }

  return { current, next }
}

/**
 * 格式化节目时间
 */
export function formatProgrammeTime(date) {
  if (!date) return ''
  const h = date.getHours().toString().padStart(2, '0')
  const m = date.getMinutes().toString().padStart(2, '0')
  return `${h}:${m}`
}
