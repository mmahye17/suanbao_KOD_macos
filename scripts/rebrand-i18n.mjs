/**
 * i18n 品牌替换：将各语言 translation.json 中作为“本应用名”的 "Chatbox" 改为 "Kod"。
 *
 * 规则：
 *  - 仅替换翻译“值”(value)，不改“键”(key)，因此代码里的 t('Chatbox ...') 调用与键保持一致，
 *    运行时查得到、显示为 Kod，无需改动任何调用点。
 *  - 保留第三方服务商名 "Chatbox AI"（负向前瞻 (?! AI)）。
 *  - 大小写敏感，因此邮箱/域名里的小写 chatboxai.com / chatboxai.app 不受影响。
 *
 * 用法：node scripts/rebrand-i18n.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LOCALES_DIR = path.resolve(__dirname, '..', 'src/renderer/i18n/locales')

// "Chatbox" 但后面不是 " AI" —— 即“本应用名”，替换为 Kod；"Chatbox AI"（服务商）保留
const RE = /Chatbox(?! AI)/g

let totalChangedValues = 0
for (const locale of fs.readdirSync(LOCALES_DIR)) {
  const file = path.join(LOCALES_DIR, locale, 'translation.json')
  if (!fs.existsSync(file)) continue
  const obj = JSON.parse(fs.readFileSync(file, 'utf8'))
  let changed = 0
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v !== 'string') continue
    if (RE.test(v)) {
      obj[k] = v.replace(RE, 'Kod')
      changed++
    }
    RE.lastIndex = 0
  }
  if (changed > 0) {
    fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`)
    totalChangedValues += changed
    console.log(`[i18n] ${locale.padEnd(8)} 改写 ${changed} 条值`)
  }
}
console.log(`[i18n] 完成：共改写 ${totalChangedValues} 条翻译值（键与代码调用点未变）`)
