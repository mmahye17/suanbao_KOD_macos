/**
 * Kod 品牌图标生成脚本（一次性/可重复运行）
 *
 * 从 document/01-logo 下的 kod 品牌素材，生成本仓库各平台所需的全部“应用自身品牌”图标资产：
 *  - 桌面：assets/icon.png|icon.icns|icon.ico、assets/icons/<size>.png、assets/icon-raw.png
 *  - Web：src/renderer/static/icon.png|favicon.png、src/renderer/favicon.ico、icons/icon-<n>.webp
 *  - 移动：resources/icon-only.png|icon-foreground.png|icon-background.png|splash.png|splash-dark.png
 *  - mac 托盘模板：assets/iconTemplate.png|@2x.png|iconTemplateRaw.png
 *  - 文档：doc/statics/icon.png
 *
 * 注意：不会触碰第三方服务商 logo（static/icons/providers/*）、语言文件类型图标（icons8-*）、MCP 工具 logo。
 *
 * 用法：node scripts/generate-kod-icons.mjs
 * 依赖：sharp（已在 node_modules）、macOS 的 iconutil（生成 .icns）。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const LOGO_DIR = path.resolve(ROOT, '..', 'document', '01-logo')

// 源素材（低分辨率，白底无透明；本脚本会自动裁掉白边并按需放大/合成）
const APP_SRC = path.join(LOGO_DIR, 'kod_App图标.png') // 圆角方形应用图标（含渐变边框）
const BRAND_SRC = path.join(LOGO_DIR, 'kod_品牌图标.png') // 品牌气泡图标（K 形）

const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
const DARK = { r: 24, g: 26, b: 27, alpha: 1 } // 深色 splash 背景

function log(msg) {
  console.log(`[kod-icons] ${msg}`)
}

function ensureDir(p) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
}

/** 裁掉源图周围的纯白/阴影边，返回“紧贴内容”的 sharp buffer（PNG，带 alpha） */
async function trimmed(src) {
  return await sharp(src).ensureAlpha().trim({ threshold: 20 }).png().toBuffer()
}

/**
 * 生成一张方形图标：把内容按 scale 比例居中放到 size×size 画布上。
 * @param content 已裁边的内容 buffer
 * @param size 画布边长
 * @param scale 内容占画布比例（0~1）
 * @param bg 背景色（null=透明）
 */
async function square(content, size, scale, bg) {
  const inner = Math.round(size * scale)
  const resized = await sharp(content).resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
  const base = sharp({
    create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } },
  })
  return await base.composite([{ input: resized, gravity: 'center' }]).png().toBuffer()
}

/** 写 PNG buffer 到指定尺寸文件 */
async function writePng(buf, outPath, size) {
  ensureDir(outPath)
  await sharp(buf).resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(outPath)
  log(`png  ${path.relative(ROOT, outPath)} (${size})`)
}

/** 手写 ICO 封装（内嵌 PNG，支持 Vista+；256 用字节 0 表示） */
async function writeIco(masterBuf, outPath, sizes) {
  const images = []
  for (const s of sizes) {
    const png = await sharp(masterBuf).resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer()
    images.push({ size: s, png })
  }
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type = icon
  header.writeUInt16LE(images.length, 4)
  const dir = Buffer.alloc(16 * images.length)
  let offset = 6 + dir.length
  images.forEach((img, i) => {
    const b = i * 16
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 0) // width
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1) // height
    dir.writeUInt8(0, b + 2) // palette
    dir.writeUInt8(0, b + 3) // reserved
    dir.writeUInt16LE(1, b + 4) // planes
    dir.writeUInt16LE(32, b + 6) // bpp
    dir.writeUInt32LE(img.png.length, b + 8) // size
    dir.writeUInt32LE(offset, b + 12) // offset
    offset += img.png.length
  })
  ensureDir(outPath)
  fs.writeFileSync(outPath, Buffer.concat([header, dir, ...images.map((i) => i.png)]))
  log(`ico  ${path.relative(ROOT, outPath)} (${sizes.join(',')})`)
}

/** 通过 iconutil 生成 .icns */
async function writeIcns(masterBuf, outPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kod-iconset-'))
  const iconset = path.join(tmp, 'icon.iconset')
  fs.mkdirSync(iconset)
  const specs = [
    [16, 'icon_16x16.png'], [32, 'icon_16x16@2x.png'],
    [32, 'icon_32x32.png'], [64, 'icon_32x32@2x.png'],
    [128, 'icon_128x128.png'], [256, 'icon_128x128@2x.png'],
    [256, 'icon_256x256.png'], [512, 'icon_256x256@2x.png'],
    [512, 'icon_512x512.png'], [1024, 'icon_512x512@2x.png'],
  ]
  for (const [s, name] of specs) {
    await sharp(masterBuf).resize(s, s, { fit: 'contain', background: WHITE }).png().toFile(path.join(iconset, name))
  }
  ensureDir(outPath)
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', outPath])
  fs.rmSync(tmp, { recursive: true, force: true })
  log(`icns ${path.relative(ROOT, outPath)}`)
}

/** mac 托盘模板：黑色剪影 + alpha（alpha 取自 logo 暗度），供 macOS 自动着色 */
async function trayTemplate(brandContent, size, outPath) {
  // 内容缩放到画布 ~78%
  const inner = Math.round(size * 0.82)
  const padded = await square(brandContent, size, 0.82, null)
  // 用灰度取反作为 alpha：logo 暗处 -> 不透明黑；白处 -> 透明
  const alpha = await sharp(padded).flatten({ background: WHITE }).greyscale().negate().linear(1.4, 0).toColourspace('b-w').png().toBuffer()
  const black = sharp({ create: { width: size, height: size, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png()
  const out = await black.joinChannel(alpha).png().toBuffer()
  ensureDir(outPath)
  await sharp(out).resize(size, size).png().toFile(outPath)
  log(`tray ${path.relative(ROOT, outPath)} (${size})`)
  void inner
}

async function main() {
  for (const f of [APP_SRC, BRAND_SRC]) {
    if (!fs.existsSync(f)) throw new Error(`源素材不存在: ${f}`)
  }
  log(`源目录: ${LOGO_DIR}`)

  const appContent = await trimmed(APP_SRC)
  const brandContent = await trimmed(BRAND_SRC)

  // 应用图标母版：白底、内容占 86%，1024×1024
  const appMaster = await square(appContent, 1024, 0.86, WHITE)

  // ---- 桌面 assets ----
  await writePng(appMaster, path.join(ROOT, 'assets/icon.png'), 1024)
  await writePng(appMaster, path.join(ROOT, 'assets/icon-raw.png'), 1024)
  for (const s of [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]) {
    await writePng(appMaster, path.join(ROOT, `assets/icons/${s}x${s}.png`), s)
  }
  await writeIco(appMaster, path.join(ROOT, 'assets/icon.ico'), [16, 24, 32, 48, 64, 128, 256])
  await writeIcns(appMaster, path.join(ROOT, 'assets/icon.icns'))

  // ---- Web ----
  await writePng(appMaster, path.join(ROOT, 'src/renderer/static/icon.png'), 1024)
  await writePng(appMaster, path.join(ROOT, 'src/renderer/static/favicon.png'), 32)
  // 透明底品牌气泡图标，供应用内 UI 使用（如引导页卡片）
  const brandTransparent = await square(brandContent, 512, 0.92, null)
  await writePng(brandTransparent, path.join(ROOT, 'src/renderer/static/icon-kod.png'), 512)
  await writeIco(appMaster, path.join(ROOT, 'src/renderer/favicon.ico'), [16, 32, 48, 64, 128, 256])
  for (const s of [48, 72, 96, 128, 192, 256, 512]) {
    const buf = await sharp(appMaster).resize(s, s, { fit: 'contain', background: WHITE }).webp({ quality: 92 }).toBuffer()
    const out = path.join(ROOT, `icons/icon-${s}.webp`)
    ensureDir(out)
    fs.writeFileSync(out, buf)
    log(`webp ${path.relative(ROOT, out)} (${s})`)
  }

  // ---- 文档 ----
  await writePng(appMaster, path.join(ROOT, 'doc/statics/icon.png'), 256)

  // ---- 移动：图标源 + Android 自适应 ----
  await writePng(appMaster, path.join(ROOT, 'resources/icon-only.png'), 1024)
  // 前景层：品牌气泡，占安全区 ~62%，透明底
  const fg = await square(brandContent, 1024, 0.62, null)
  await writePng(fg, path.join(ROOT, 'resources/icon-foreground.png'), 1024)
  // 背景层：纯白
  const bg = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: WHITE } }).png().toBuffer()
  await writePng(bg, path.join(ROOT, 'resources/icon-background.png'), 1024)

  // ---- 移动：Splash（亮/暗），品牌气泡居中约 26% ----
  const splashLight = await square(brandContent, 2732, 0.26, WHITE)
  ensureDir(path.join(ROOT, 'resources/splash.png'))
  await sharp(splashLight).png().toFile(path.join(ROOT, 'resources/splash.png'))
  log('png  resources/splash.png (2732)')
  const splashDark = await square(brandContent, 2732, 0.26, DARK)
  await sharp(splashDark).png().toFile(path.join(ROOT, 'resources/splash-dark.png'))
  log('png  resources/splash-dark.png (2732)')

  // ---- mac 托盘模板 ----
  await trayTemplate(brandContent, 512, path.join(ROOT, 'assets/iconTemplateRaw.png'))
  await trayTemplate(brandContent, 512, path.join(ROOT, 'assets/iconTemplateRawPreview.png'))
  await trayTemplate(brandContent, 16, path.join(ROOT, 'assets/iconTemplate.png'))
  await trayTemplate(brandContent, 64, path.join(ROOT, 'assets/iconTemplate@2x.png'))

  log('完成 ✅')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
