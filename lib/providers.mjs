import { readFileSync } from 'node:fs'

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
  const base = String(process.env.HOME ?? '') + '/.config/magpie/plugins/node_modules'
  const candidates = [
    ['workbuddy', `${base}/@magpie-community/opencode-workbuddy-auth/package.json`],
    ['codebuddy', `${base}/@magpie-community/opencode-codebuddy-auth/package.json`],
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
