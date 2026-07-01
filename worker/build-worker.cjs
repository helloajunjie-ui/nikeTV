/**
 * NikoTV Worker 构建脚本
 * 将 dist/ 中的 JS/CSS 内联到 worker.js 中
 *
 * 用法：node build-worker.js
 * 前置条件：npm run build 已执行
 */

const fs = require('fs')
const path = require('path')

const DIST_DIR = path.resolve(__dirname, '../dist')
const WORKER_FILE = path.resolve(__dirname, 'worker.js')

// 需要内联的资源路径（相对于 dist/）
const INLINE_FILES = [
  'assets/index-BWF47It2.js',
  'assets/index-DXI25N5C.css',
]

// 小文件（直接内联到 ASSETS map）
const SMALL_FILES = [
  'favicon.svg',
  'manifest.json',
  'icons.svg',
  'sw.js',
  'icons/icon-192.svg',
  'icons/icon-512.svg',
]

function build() {
  let workerCode = fs.readFileSync(WORKER_FILE, 'utf-8')

  // 1. 内联大文件到 INLINE_ASSETS
  const inlineAssets = {}
  for (const file of INLINE_FILES) {
    const filePath = path.join(DIST_DIR, file)
    if (!fs.existsSync(filePath)) {
      console.error(`[ERROR] 文件不存在: ${filePath}`)
      process.exit(1)
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    inlineAssets[`/${file}`] = content
    console.log(`[OK] 内联: /${file} (${(content.length / 1024).toFixed(1)}KB)`)
  }

  // 替换 INLINE_ASSETS 占位
  const assetsJSON = JSON.stringify(inlineAssets, null, 2)
  workerCode = workerCode.replace(
    /const INLINE_ASSETS = \{\}/,
    `const INLINE_ASSETS = ${assetsJSON}`
  )

  // 2. 内联小文件到 ASSETS map
  const smallAssets = {}
  for (const file of SMALL_FILES) {
    const filePath = path.join(DIST_DIR, file)
    if (!fs.existsSync(filePath)) {
      console.warn(`[WARN] 文件不存在，跳过: ${filePath}`)
      continue
    }
    const content = fs.readFileSync(filePath, 'utf-8')
    const ext = path.extname(file)
    const contentTypeMap = {
      '.svg': 'image/svg+xml',
      '.json': 'application/json',
      '.js': 'application/javascript',
    }
    smallAssets[`/${file}`] = {
      contentType: contentTypeMap[ext] || 'text/plain',
      data: content,
    }
    console.log(`[OK] 内联: /${file} (${(content.length / 1024).toFixed(1)}KB)`)
  }

  const smallJSON = JSON.stringify(smallAssets, null, 2)
  workerCode = workerCode.replace(
    /const ASSETS = \{[\s\S]*?\}/,
    `const ASSETS = ${smallJSON}`
  )

  // 3. 更新 INDEX_HTML 中的资源哈希
  // 从 dist/index.html 中读取实际引用的文件名
  const distIndex = path.join(DIST_DIR, 'index.html')
  if (fs.existsSync(distIndex)) {
    const html = fs.readFileSync(distIndex, 'utf-8')
    const jsMatch = html.match(/src="(\/assets\/index-[^"]+\.js)"/)
    const cssMatch = html.match(/href="(\/assets\/index-[^"]+\.css)"/)

    if (jsMatch && cssMatch) {
      const newJS = jsMatch[1]
      const newCSS = cssMatch[1]

      // 更新 INDEX_HTML 中的引用
      workerCode = workerCode.replace(
        /src="\/assets\/index-[^"]+\.js"/,
        `src="${newJS}"`
      )
      workerCode = workerCode.replace(
        /href="\/assets\/index-[^"]+\.css"/,
        `href="${newCSS}"`
      )

      // 更新 serveStatic 中的路径匹配
      workerCode = workerCode.replace(
        /path === '\/assets\/index-[^']+\.js'/,
        `path === '${newJS}'`
      )
      workerCode = workerCode.replace(
        /path === '\/assets\/index-[^']+\.css'/,
        `path === '${newCSS}'`
      )

      console.log(`[OK] 更新资源引用: ${newJS}, ${newCSS}`)
    }
  }

  fs.writeFileSync(WORKER_FILE, workerCode, 'utf-8')
  console.log('\n[DONE] Worker 构建完成')
}

build()
