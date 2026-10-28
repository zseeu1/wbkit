// 猫猫旅行：领养 → 派出 → 到达领奖。逻辑都在 growth.mjs 里（runTravelOnce 每次
// 只推进一步），这里只负责「什么时候推」和「把状态记下来」。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { CONFIG_DIR, AUTH_FILE } from './pools.mjs'
import { readAuth, accountsOf } from './store.mjs'
import { createGrowth, growthAccountOf } from './growth.mjs'

export const STATE_FILE = join(CONFIG_DIR, 'wbkit-checkin.json')
const DEFAULT_EVERY_MIN = 30
const MIN_GAP_MS = 5 * 60_000

const growth = createGrowth({ id: 'workbuddy', name: 'WorkBuddy' })
const G = growth._internal

const STATE_LABEL = {
  idle: '在家待着',
  traveling: '出门旅行中',
  arrived: '已到达，可领奖',
}

function cnAccounts() {
  let store = {}
  try {
    store = readAuth(AUTH_FILE).store
  } catch {
    return []
  }
  return accountsOf(store, 'workbuddy')
    .filter(({ auth }) => auth?.access && !auth?.enterpriseId)
    .map(({ key, auth }) => ({ key, auth, acct: growthAccountOf({ id: 'workbuddy' }, auth) }))
}

export function readState(file = STATE_FILE) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    return { version: 1, accounts: {}, travel: { accounts: {} } }
  }
}

function writeState(state, file = STATE_FILE) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, file)
}

// 只读状态：有猫没猫、在不在路上、今天还能不能出门
export async function travelSnapshot() {
  const out = []
  for (const { auth, acct } of cnAccounts()) {
    const row = { uid: acct.uid, accountId: auth.accountId || acct.uid, hasPet: null, state: '', label: '', dailyLimitReached: false, error: '' }
    try {
      const info = await G.buddyInfo(acct)
      row.hasPet = Boolean(info)
      if (info) {
        const st = await G.travelStatus(acct)
        row.state = String(st?.state || '')
        row.label = STATE_LABEL[row.state] || row.state || '未知'
        row.dailyLimitReached = Boolean(st?.daily_limit_reached)
        if (st?.record_id) row.recordId = Number(st.record_id)
      } else {
        row.label = '还没有猫'
      }
    } catch (e) {
      row.error = String(e?.message ?? e).slice(0, 120)
    }
    out.push(row)
  }
  return out
}

// maybeTravel 按间隔推进一步：到了间隔、开关开着、且距上次至少 5 分钟才动手。
export async function maybeTravel(options = {}, { force = false, now = Date.now(), stateFile = STATE_FILE } = {}) {
  const enabled = options.autoTravel === true || force
  if (!enabled) return { skipped: 'off' }
  const state = readState(stateFile)
  state.travel ??= { accounts: {} }
  state.travel.accounts ??= {}

  const everyMin = Math.max(5, Number(options.travelEveryMin) || DEFAULT_EVERY_MIN)
  const lastRun = Number(state.travel.lastRunAt) || 0
  if (!force && lastRun && now - lastRun < everyMin * 60_000) return { skipped: 'waiting', nextIn: Math.round((everyMin * 60_000 - (now - lastRun)) / 60000) }
  if (!force && lastRun && now - lastRun < MIN_GAP_MS) return { skipped: 'cooldown' }

  const results = []
  for (const { auth, acct } of cnAccounts()) {
    try {
      const r = await G.runTravelOnce(acct)
      state.travel.accounts[acct.uid] = {
        accountId: auth.accountId || acct.uid,
        at: now,
        outcome: r.outcome,
        message: r.message ?? '',
        credit: r.credit ?? 0,
      }
      results.push({ uid: acct.uid, accountId: auth.accountId, ...r })
    } catch (e) {
      state.travel.accounts[acct.uid] = { accountId: auth.accountId || acct.uid, at: now, outcome: 'failed', message: String(e?.message ?? e).slice(0, 160) }
    }
  }
  state.travel.lastRunAt = now
  writeState(state, stateFile)
  return { ran: results.length, results, lastRunAt: now }
}

// 页面「立刻推进一步」：写 pendingTravel.at，宿主重载时消费
export async function consumePendingTravel(options = {}, { now = Date.now(), stateFile = STATE_FILE } = {}) {
  const asked = Number(options?.pendingTravel?.at) || 0
  const state = readState(stateFile)
  if (!asked || asked <= (Number(state.travel?.lastPendingAt) || 0)) return { skipped: 'no-request' }
  const r = await maybeTravel({ ...options, autoTravel: true }, { force: true, now, stateFile })
  const after = readState(stateFile)
  after.travel ??= { accounts: {} }
  after.travel.lastPendingAt = asked
  writeState(after, stateFile)
  return { pending: asked, ...r }
}

export function travelSummary(now = Date.now(), stateFile = STATE_FILE) {
  const state = readState(stateFile)
  const travel = state.travel ?? { accounts: {} }
  return {
    lastRunAt: Number(travel.lastRunAt) || 0,
    accounts: Object.entries(travel.accounts ?? {}).map(([uid, r]) => ({ uid, ...r })),
  }
}
