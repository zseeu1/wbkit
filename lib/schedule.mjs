// 插件自己的签到调度：页面上的开关写进插件 options，插件在加载和每次查余额时
// 顺手看一眼「今天到点没有」。这样不用去动 magpie 的 warmups，也不依赖它。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONFIG_DIR, AUTH_FILE } from './pools.mjs'
import { readAuth, accountsOf } from './store.mjs'
import { checkinFor } from './checkin.mjs'

export const STATE_FILE = join(CONFIG_DIR, 'wbkit-checkin.json')
// magpie 内置调度（用量页那个「自动签到」）把结果记在这里：workbuddy|workbuddy#xxxx
export const MAGPIE_JOURNAL = join(CONFIG_DIR, 'plugin-checkin.json')
// magpie 对 WorkBuddy / Trae / Qoder / MiniMax 有原生签到，结果记在这里（键是 uid）
export const BUILTIN_JOURNAL = join(CONFIG_DIR, 'workbuddy-checkin.json')
const COOLDOWN_MS = 30 * 60_000

// 北京时间
export function beijingNow(now = Date.now()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(now))
  const [date, time] = parts.split(' ')
  return { date, time: (time ?? '00:00').slice(0, 5), now }
}

export function readJournal(file = MAGPIE_JOURNAL) {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) ?? {}
  } catch {
    return {}
  }
}

// magpie 今天已经替这个账号签过？同一天就不再发请求。
// 两本账都要看：插件钩子的记在 plugin-checkin.json（键是账号键），
// magpie 原生 WorkBuddy 签到记在 workbuddy-checkin.json（键是 uid）。
export function journalDoneOn(key, today, file = MAGPIE_JOURNAL) {
  const entry = readJournal(file)[`workbuddy|${key}`]
  return Boolean(entry && entry.day === today)
}

export function builtinDoneOn(uid, today, file = BUILTIN_JOURNAL) {
  const entry = readJournal(file)[`workbuddy|${uid}`]
  return Boolean(entry && entry.day === today)
}

// 内置那条记录（页面要显示来源与积分）
export function builtinEntry(uid, file = BUILTIN_JOURNAL) {
  return readJournal(file)[`workbuddy|${uid}`] ?? null
}

export function readState(file = STATE_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { version: 1, doneOn: '', accounts: {} }
  }
}

function writeState(state, file = STATE_FILE) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, file)
}

function cnAccounts() {
  let store = {}
  try {
    store = readAuth(AUTH_FILE).store
  } catch {
    return []
  }
  return accountsOf(store, 'workbuddy').filter(({ auth }) => auth?.access && !auth?.enterpriseId)
}

// consumePending 处理页面「立即签到」按钮：按钮只把时间戳写进 options，
// 宿主重载插件时这里看到比上次新的时间戳就跑一轮强制签到。
export async function consumePending(options = {}, { now = Date.now(), stateFile = STATE_FILE } = {}) {
  const asked = Number(options?.pendingCheckin?.at) || 0
  const state = readState(stateFile)
  if (!asked || asked <= (Number(state.lastPendingAt) || 0)) return { skipped: 'no-request' }
  const r = await maybeCheckin({ ...options, autoCheckin: true }, { force: true, now, stateFile })
  const after = readState(stateFile)
  after.lastPendingAt = asked
  writeState(after, stateFile)
  return { pending: asked, ...r }
}

// maybeCheckin 每天最多跑一轮：到点、开关开着、今天还没全签过才动手。
export async function maybeCheckin(options = {}, { force = false, now = Date.now(), stateFile = STATE_FILE } = {}) {
  const enabled = options.autoCheckin === true || force
  if (!enabled) return { skipped: 'off' }
  const at = String(options.checkinAt || '09:05')
  const clock = beijingNow(now)
  if (!force && clock.time < at) return { skipped: 'too-early', at }

  const state = readState(stateFile)
  state.accounts ??= {}
  const accounts = cnAccounts()
  if (!accounts.length) return { skipped: 'no-account' }

  const last = Number(state.lastAttemptAt) || 0
  if (!force && last && now - last < COOLDOWN_MS && state.doneOn === clock.date) return { skipped: 'throttled' }

  const results = []
  for (const { key, auth } of accounts) {
    if (!force && state.doneOn === clock.date && state.accounts[auth.uid]?.date === clock.date) continue
    // magpie 已经签过（原生 WorkBuddy 签到，或内置调度走的插件钩子），不再打接口
    if (!force && (builtinDoneOn(auth.uid, clock.date) || journalDoneOn(key, clock.date))) {
      state.accounts[auth.uid] = {
        date: clock.date,
        at: now,
        outcome: 'done',
        credit: 0,
        message: 'magpie 今天已签到（原生签到或内置调度）',
        accountId: auth.accountId || key,
        source: 'magpie',
      }
      results.push({ uid: auth.uid, accountId: auth.accountId, outcome: 'done', message: 'magpie 今天已签到' })
      continue
    }
    const r = await checkinFor('workbuddy', async () => auth, { takeOverCheckin: true })
    state.accounts[auth.uid] = {
      date: clock.date,
      at: now,
      outcome: r.outcome,
      credit: r.credit ?? 0,
      ...(r.streak ? { streak: r.streak } : {}),
      message: r.message ?? '',
      accountId: auth.accountId || key,
    }
    results.push({ uid: auth.uid, accountId: auth.accountId, ...r })
  }

  const allDone = cnAccounts().every(({ auth }) => {
    const rec = state.accounts[auth.uid]
    return rec && rec.date === clock.date && (rec.outcome === 'claimed' || rec.outcome === 'done')
  })
  if (allDone) state.doneOn = clock.date
  state.lastAttemptAt = now
  state.lastRunAt = results.length ? now : state.lastRunAt ?? 0
  writeState(state, stateFile)
  return { ran: results.length, results, doneOn: state.doneOn }
}

export function checkinSummary(now = Date.now(), stateFile = STATE_FILE) {
  const state = readState(stateFile)
  const clock = beijingNow(now)
  const rows = Object.entries(state.accounts ?? {}).map(([uid, rec]) => ({ uid, ...rec }))
  return {
    doneOn: state.doneOn ?? '',
    today: clock.date,
    lastRunAt: state.lastRunAt ?? 0,
    accounts: rows,
  }
}
