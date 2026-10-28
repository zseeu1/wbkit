// 官方请求用量：POST {web 域}/billing/meter/get-user-request-usage
// body {startTime, endTime, pageNum, pageSize}，返回 data.total 与 data.data[]。
//
// 服务端单次最多给 3000 条，超过时**保留区间内最早的一批**，翻页拿不到更新的，
// 所以照 wb-switch 的办法：取满就把起点推进到本轮最新一条的时间戳，再扫一轮。
//
// 只挑 requestId / model / credit / client / requestTime 五个字段。
// 返回里还有 input / inputTrunc（提示词原文），一个字节都不留。
import { callAny, saidOf } from './api.mjs'

const PAGE_SIZE = 3000
const MAX_ROUNDS = 100
const CACHE_MS = 5 * 60_000
const cache = new Map()

const pad = (n) => String(n).padStart(2, '0')
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export function windowOf(days = 30, now = new Date()) {
  const end = new Date(now)
  const start = new Date(now.getTime() - (Math.max(1, days) - 1) * 864e5)
  return { startTime: `${day(start)} 00:00:00`, endTime: `${day(end)} 23:59:59`, rangeStart: day(start), rangeEnd: day(end) }
}

export function rowOf(item) {
  const id = item?.requestId
  if (!id) return null
  return {
    requestId: String(id),
    model: String(item?.model ?? ''),
    credit: Number(item?.credit ?? 0) || 0,
    client: String(item?.client ?? ''),
    requestTime: String(item?.requestTime ?? ''),
  }
}

export function aggregate(rows) {
  const byDay = new Map()
  const byModel = new Map()
  for (const r of rows) {
    const d = r.requestTime.slice(0, 10)
    const dayRow = byDay.get(d) ?? { date: d, credit: 0, count: 0 }
    dayRow.credit += r.credit
    dayRow.count += 1
    byDay.set(d, dayRow)
    const m = byModel.get(r.model) ?? { model: r.model, credit: 0, count: 0 }
    m.credit += r.credit
    m.count += 1
    byModel.set(r.model, m)
  }
  const round = (x) => Math.round(x * 100) / 100
  return {
    byDay: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ ...x, credit: round(x.credit) })),
    byModel: [...byModel.values()].sort((a, b) => b.credit - a.credit).map((x) => ({ ...x, credit: round(x.credit) })),
    credit: round(rows.reduce((s, r) => s + r.credit, 0)),
    count: rows.length,
  }
}

export async function fetchUsage(provider, auth, { days = 30, detail = 0 } = {}) {
  const win = windowOf(days)
  const key = `${provider}:${auth?.uid}:${days}`
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.value, cached: true }

  let startTime = win.startTime
  const seen = new Set()
  const rows = []
  let rounds = 0
  let last = null

  while (rounds < MAX_ROUNDS) {
    rounds += 1
    const res = await callAny(auth, provider, 'usage', {
      startTime,
      endTime: win.endTime,
      pageNum: 1,
      pageSize: PAGE_SIZE,
    }, 30000)
    last = res
    if (res.status === 401 || res.status === 403) {
      const err = new Error('WorkBuddy 拒绝了这个登录，请重新登录')
      err.signIn = 'expired'
      throw err
    }
    const page = res.json?.data?.data
    if (!Array.isArray(page)) break
    let newest = ''
    for (const item of page) {
      const r = rowOf(item)
      if (!r) continue
      const dedupe = `${r.requestId}@${r.requestTime}`
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      rows.push(r)
      if (r.requestTime > newest) newest = r.requestTime
    }
    if (page.length < PAGE_SIZE || !newest) break
    startTime = newest
  }

  if (!rows.length && last && last.status !== 200) {
    return { error: `读不到用量：${saidOf(last)}`, ...win, byDay: [], byModel: [], credit: 0, count: 0 }
  }

  const value = {
    ...win,
    ...aggregate(rows),
    rounds,
    truncated: rounds >= MAX_ROUNDS,
    requests: detail > 0 ? [...rows].sort((a, b) => b.requestTime.localeCompare(a.requestTime)).slice(0, detail) : [],
  }
  cache.set(key, { at: Date.now(), value })
  return value
}
