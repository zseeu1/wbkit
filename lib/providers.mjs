import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_DIR } from './pools.mjs'

// 「谁算 WorkBuddy 账号」只认两件事：账号键里的 provider id，或登录态里的域。
//
// magpie 0.1.1993 起把内置供应商改叫 codebuddy，账号键也跟着从 workbuddy#… 变成
// codebuddy#…；而社区插件仍叫 workbuddy / workbuddy-ai。写死任何一个都会有一天读不到。
const CN_IDS = new Set(['workbuddy', 'codebuddy', 'codebuddy-cn'])
const INTL_IDS = new Set(['workbuddy-ai', 'codebuddy-ai'])

export function providerIdOf(key) {
  const i = String(key).indexOf('#')
  return i === -1 ? String(key) : String(key).slice(0, i)
}

export function isIntlAccount(key, auth) {
  const id = providerIdOf(key)
  if (INTL_IDS.has(id)) return true
  if (CN_IDS.has(id)) return false
  const domain = String(auth?.domain ?? '')
  return /\.ai$/i.test(domain) || domain.includes('workbuddy.ai') || domain.includes('codebuddy.ai')
}

// 是不是 WorkBuddy / CodeBuddy 的登录态（键名或域命中即可）
export function isWorkBuddyAccount(key, auth) {
  const id = providerIdOf(key)
  if (CN_IDS.has(id) || INTL_IDS.has(id)) return true
  const domain = String(auth?.domain ?? '')
  return /(workbuddy|codebuddy)\.(cn|ai)$/i.test(domain)
}

// 状态文件里用哪个键记这个账号：有 uid 用 uid（历史口径，页面对得上），
// 没有 uid 的（宿主新建的账号只有令牌）退回账号键，否则多个空 uid 的账号会挤在
// 同一个 "undefined"/"" 键上互相覆盖。记录里同时带上 key，页面才能按 key 对齐。
export function stateKeyOf(key, auth) {
  const uid = String(auth?.uid ?? '').trim()
  return uid || String(key ?? '')
}

// 状态记录 → 摘要行：老记录只有 uid（键就是 uid、没有 key 字段），新记录带 key。
// 统一成 { uid, key }，页面按 key 对齐账号列表，老记录还能按 uid 对上。
export function stateRow(id, rec = {}) {
  const key = String(rec.key ?? '')
  const idText = String(id ?? '')
  if (!key) return { ...rec, uid: String(rec.uid ?? idText), key: '' }
  // 记录带 key 时，键要么是 uid（有 uid 的账号，历史口径），要么就是账号键本身
  return { ...rec, uid: String(rec.uid ?? (key === idText ? '' : idText)), key }
}

// 从 store 里挑出所有 WorkBuddy 账号
export function workBuddyAccounts(store) {
  const out = []
  for (const [key, value] of Object.entries(store ?? {})) {
    const auth = value?.auth ?? value
    if (!isWorkBuddyAccount(key, auth)) continue
    out.push({ key, auth, id: providerIdOf(key), intl: isIntlAccount(key, auth) })
  }
  return out
}

// 装了社区 WorkBuddy 插件时，它声明的 id 才是 magpie 认的那套（workbuddy / workbuddy-ai）。
// 没装就退回 store 里现有的前缀，至少不会把账号改到一个没人服务的 id 上。
export function servedIds() {
  const base = join(CONFIG_DIR, 'plugins', 'node_modules')
  const candidates = [
    ['workbuddy', join(base, '@magpie-community', 'opencode-workbuddy-auth', 'package.json')],
    ['codebuddy', join(base, '@magpie-community', 'opencode-codebuddy-auth', 'package.json')],
  ]
  for (const [id, file] of candidates) {
    try {
      const pkg = JSON.parse(readFileSync(file, 'utf8'))
      if (pkg?.name) return { cn: id, intl: `${id}-ai` }
    } catch {
      /* 没装 */
    }
  }
  return null
}

// store 现在实际在用哪套 id（导出的账号要落到同一套上，否则 magpie 不认）
export function activeIds(store) {
  const served = servedIds()
  if (served) return served
  const seen = new Set(workBuddyAccounts(store).map((a) => a.id))
  const cn = seen.has('codebuddy') ? 'codebuddy' : 'workbuddy'
  const intl = seen.has('codebuddy-ai') ? 'codebuddy-ai' : 'workbuddy-ai'
  return { cn, intl }
}
