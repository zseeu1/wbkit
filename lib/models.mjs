import { UpstreamError } from './wbclient.mjs'

// WorkBuddy 客户端自己展示的模型列表，来自它的产品配置 /v3/config：每个模型的
// 积分倍率、上下文、限制它的档位、正在跑的促销，以及账号套餐（来自账单汇总）。
// 只读：不调用任何模型，也不消耗积分。
const round = (n) => Math.round(n * 100) / 100
const china = 'https://copilot.tencent.com'
const intl = 'https://www.workbuddy.ai'

// "x0.34 credits"、"x0.00"、"0.50x" 和 0 都是倍率；""（Auto）随任务浮动。
export function creditsOf(c) {
  const s = String(c ?? '').trim().toLowerCase().replace(/\s+credits?$/, '').replace(/^x|x$/g, '')
  const n = Number(s)
  return s !== '' && Number.isFinite(n) && n >= 0 ? n : null
}

const hhmm = (t) => String(t).replace(/^(\d):/, '0$1:')
const live = (p, now) => p && p.enabled !== false && !(Date.parse(p.schedule?.validFrom) > now) && !(Date.parse(p.schedule?.validUntil) <= now)

// 档位徽标写着 "Only"（WorkBuddy AI 的 "Pro Only"）就把免费套餐挡在门外；
// 国内的「订阅优先」只是让免费套餐排在会员之后。
const exclusive = (t) => /only|专属|仅限/i.test(`${t.badge?.label || ''} ${t.badge?.labelEn || ''}`)

export function catalog(cfg, now = Date.now()) {
  const ids = (cfg?.agents || []).find((a) => a.name === 'cli')?.models || []
  const tiers = (cfg?.modelTiers || []).filter((t) => t.enabled !== false)
  const promos = (cfg?.modelPromotions || []).filter((p) => p.kind === 'discount' && live(p, now))
  const list = ids.map((id) => {
    const d = (cfg.models || []).find((m) => m.id === id) || {}
    const rate = creditsOf(d.credits)
    const row = { id, name: d.name || id, desc: d.descriptionZh || d.descriptionEn || '', rate, context: Number(d.maxInputTokens) || 0, isDefault: d.isDefault === true }
    const tier = tiers.find((t) => t.modelIds?.includes(id))
    if (tier) row.tier = { label: tier.badge?.label || tier.badge?.labelEn || '', note: tier.hover?.textZh || tier.hover?.textEn || '', exclusive: exclusive(tier) }
    // 一个模型可能同时挂着只带徽标的促销和真正定价的那个
    // （GLM-5.2 白天的「夜间折扣」徽标，与 23:00–08:00 的折扣）。
    const offers = promos.filter((p) => p.modelIds?.includes(id))
    const label = offers.map((p) => p.badge?.label).find(Boolean)
    if (label) {
      const priced = offers.find((p) => p.discount)
      const said = priced && creditsOf(priced.discount.discountedCredits)
      const factor = Number(priced?.discount?.factor)
      const note = offers.map((p) => p.hover?.textZh || p.hover?.textEn).find(Boolean) || ''
      // DeepSeek 的错峰折扣只有徽标：价格只在文字里（「非高峰期积分5折」），
      // 就按它说的折数算。
      const told = !priced && rate !== null && note.match(/(\d+(?:\.\d+)?)\s*折/)
      const off = said ?? (Number.isFinite(factor) && rate !== null ? round(rate * factor) : told ? round((rate * told[1]) / 10) : null)
      row.promo = {
        label,
        note,
        hours: priced ? (priced.schedule?.daily || []).map((h) => `${hhmm(h.start)}–${hhmm(h.end)}`).join('、') : told && /非高峰/.test(note) ? '非高峰' : '',
        until: Math.max(0, ...offers.map((p) => Date.parse(p.schedule?.validUntil) || 0)),
        ...(off !== null ? { rate: off } : {}),
        ...(told ? { approx: true } : {}),
      }
    }
    return row
  })
  // 同名两个 id（国内的 hy3 与 hy3-x 都叫 "Hy3"）用后缀区分开。
  const first = new Map()
  for (const m of list) {
    const id = first.get(m.name)
    if (id === undefined) {
      first.set(m.name, m.id)
      continue
    }
    m.name = `${m.name} (${m.id.startsWith(id + '-') ? m.id.slice(id.length + 1).toUpperCase() : m.id})`
  }
  return list
}

const planOf = (sum) => {
  const s = sum?.Response?.Data ?? sum ?? {}
  return { name: s.SubscriptionPackageName || (s.IsPaidUser ? 'Pro' : 'Free'), paid: s.IsPaidUser === true }
}

// 国内：走一个续期由 Magpie 维持的国内账号客户端。
export async function chinaModels(client, now = Date.now()) {
  const models = catalog(await client.request('/v3/config', { base: china }), now)
  const plan = planOf(await client.request('/billing/meter/get-user-resource-summary', { body: {}, base: china }))
  return { models, plan, account: client.account.name }
}

// 国际版：登录续期归 Magpie，过期只报错，绝不在这里刷新。
export async function intlModels(account, { fetcher = fetch, proxy = '', now = Date.now() } = {}) {
  const a = account.auth
  if (a.expires && a.expires <= now) throw new Error('国际版登录已过期，请在 Magpie 重新登录 WorkBuddy AI')
  const headers = {
    Authorization: `Bearer ${a.access}`,
    'X-User-Id': a.uid ?? '',
    'X-Domain': a.domain || new URL(intl).host,
    'X-Product': 'SaaS',
    'X-IDE-Type': 'WorkBuddy',
    'X-IDE-Name': 'WorkBuddy',
    'X-IDE-Version': '5.9.3',
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'WorkBuddy/5.9.3 workbuddy-ai/5.9.3 CLI/2.165.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
  const call = async (path, body) => {
    const response = await fetcher(intl + path, { method: body ? 'POST' : 'GET', headers, ...(body ? { body } : {}), signal: AbortSignal.timeout(30_000), ...(proxy ? { proxy } : {}) })
    let payload = {}
    try { payload = JSON.parse(await response.text()) } catch { /* 非 JSON 按空对象 */ }
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) throw new UpstreamError(path, response.status, payload)
    return payload.data
  }
  return { models: catalog(await call('/v3/config'), now), plan: planOf(await call('/billing/meter/get-user-resource-summary', '{}')), account: account.name }
}
