// 页面的逐包明细：magpie 的账号卡走上游的 auth.usage（聚合窗口），
// 这里只给 page/data.js 用，把几十个资源包按名字合并、按作废时间排序。
// 不注册成钩子，避免和上游重复。
// 数据来自 POST /v2/billing/meter/get-user-resource（body 传 {}），返回
// data.Response.Data.Accounts[]，一个账号有几十个资源包（按周期/来源拆开）。
import { callAny, saidOf } from './api.mjs'

const FAR_FUTURE_MS = 730 * 864e5 // 官方有 2049 这类占位到期值，超过两年当"长期有效"
const CACHE_MS = 60_000
const cache = new Map()

// "2026-09-28 16:35:56" 是北京时间
function beijingTime(text) {
  if (typeof text !== 'string' || !text.trim()) return 0
  const t = Date.parse(`${text.trim().replace(' ', 'T')}+08:00`)
  return Number.isFinite(t) ? t : 0
}

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// 按优先级取第一个有效读数：跳过 undefined / null / 空串，0 算有效值。
function numVal(acc, keys) {
  for (const k of keys) {
    const v = acc?.[k]
    if (v !== undefined && v !== null && v !== '') {
      const n = Number(v)
      if (Number.isFinite(n)) return n
    }
  }
  return 0
}

// 与 lib/engine/credits.mjs 的 parsePackageAccount 同口径：本期周期字段
// （CycleCapacity*）优先，其次才退回总量字段（Capacity*）；Precise 又优先于整数版。
// 上游常只填三量里的两个，缺的量用另两个互补，补出的下限 0（0 是有效读数，
// 不能当成"没给"）。
function capacityOf(acc) {
  const size = numVal(acc, ['CycleCapacitySizePrecise', 'CycleCapacitySize', 'CapacitySizePrecise', 'CapacitySize'])
  let remain = numVal(acc, ['CycleCapacityRemainPrecise', 'CycleCapacityRemain', 'CapacityRemainPrecise', 'CapacityRemain'])
  let used = numVal(acc, ['CycleCapacityUsedPrecise', 'CycleCapacityUsed', 'CapacityUsedPrecise', 'CapacityUsed'])
  if (size > 0 && used <= 0) used = Math.max(0, size - remain)
  else if (size > 0 && remain <= 0) remain = Math.max(0, size - used)
  return { size, remain, used }
}

// summarise 是纯函数：给一组资源包，算出余额、总量、最早作废时间。
export function summarise(accounts, now = Date.now()) {
  const live = (accounts ?? []).filter((a) => {
    const end = beijingTime(a?.CycleEndTime)
    return !end || end > now
  })
  const groups = new Map()
  for (const a of live) {
    const name = a?.PackageName || a?.ProductName || '资源包'
    const g = groups.get(name) ?? { name, balance: 0, size: 0, used: 0, runsOutAt: 0, unit: a?.CapacityUnit || 'credits' }
    const cap = capacityOf(a)
    g.balance += cap.remain
    g.size += cap.size
    g.used += cap.used
    const ends = [num(a?.DeductionEndTime), beijingTime(a?.ExpiredTime)].filter((t) => t > 0 && t <= now + FAR_FUTURE_MS)
    if (ends.length) {
      const soonest = Math.min(...ends)
      g.runsOutAt = g.runsOutAt ? Math.min(g.runsOutAt, soonest) : soonest
    }
    groups.set(name, g)
  }
  const packages = [...groups.values()]
    .map((g) => ({
      ...g,
      balance: Math.round(g.balance * 100) / 100,
      size: Math.round(g.size * 100) / 100,
      used: Math.round(g.used * 100) / 100,
    }))
    .sort((a, b) => (a.runsOutAt || Infinity) - (b.runsOutAt || Infinity) || b.balance - a.balance)

  const detail = live
    .map((a) => {
      const cap = capacityOf(a)
      return {
        name: a?.PackageName || a?.ProductName || '积分包',
        balance: cap.remain,
        size: cap.size,
        runsOutAt: [num(a?.DeductionEndTime), beijingTime(a?.ExpiredTime)].filter((t) => t > 0 && t <= now + FAR_FUTURE_MS).sort()[0] || 0,
      }
    })
    .filter((p) => p.balance > 0)
    .sort((a, b) => (a.runsOutAt || Infinity) - (b.runsOutAt || Infinity))

  return {
    detail,
    packages,
    balance: Math.round(packages.reduce((s, g) => s + g.balance, 0) * 100) / 100,
    size: Math.round(packages.reduce((s, g) => s + g.size, 0) * 100) / 100,
    used: Math.round(packages.reduce((s, g) => s + g.used, 0) * 100) / 100,
    runsOutAt: packages.reduce((min, g) => (g.runsOutAt && (!min || g.runsOutAt < min) ? g.runsOutAt : min), 0),
    live: live.length,
    total: (accounts ?? []).length,
  }
}

function buildFor(provider) {
  return /ai$/i.test(String(provider)) ? 'workbuddy-ai' : 'workbuddy'
}

export function asUsage(summary, auth) {
  const windows = summary.packages.slice(0, 5).map((g) => ({
    name: g.name,
    unit: g.unit,
    balance: g.balance,
    limit: g.size,
    used: g.used,
    display: `${g.balance} / ${g.size}`,
    ...(g.runsOutAt ? { runsOutAt: new Date(g.runsOutAt).toISOString() } : {}),
  }))
  const until = Number(auth?.refreshExpiresAt) > 0 ? new Date(Number(auth.refreshExpiresAt)).toISOString() : undefined
  return {
    plan: '个人版',
    user: auth?.accountId || String(auth?.uid ?? ''),
    ...(until ? { until } : {}),
    windows,
    signIn: 'kept',
  }
}

// quotaFor 给 auth.usage 用：失败降级成 { error, windows: [] }，登录被拒交给 magpie 标账号。
export async function quotaFor(provider, getAuth) {
  const auth = await getAuth()
  if (!auth?.access) return { error: '这个账号没有登录令牌', windows: [] }
  const key = `${provider}:${auth.uid || auth.accountId || 'unknown'}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value

  const res = await callAny(auth, buildFor(provider), 'resource', {}, 15000)
  if (res.status === 401 || res.status === 403) {
    const err = new Error('WorkBuddy 拒绝了这个登录，请重新登录')
    err.signIn = 'expired'
    throw err
  }
  const accounts = res.json?.data?.Response?.Data?.Accounts ?? res.json?.data?.Accounts
  let value
  if (!Array.isArray(accounts)) {
    value = { error: `读不到积分：${saidOf(res)}`, windows: [] }
  } else {
    const summary = summarise(accounts)
    value = asUsage(summary, auth)
    value.total = accounts.length
    value.live = summary.live
    value.balance = summary.balance
    value.size = summary.size
    value.used = summary.used
    value.detail = summary.detail
  }
  cache.set(key, { at: Date.now(), value })
  return value
}
