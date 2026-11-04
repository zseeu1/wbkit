// 单账号动作 + 每日自动成长任务（无服务版）。
//
// 面板沙盒没有网络，按钮只能把请求写进 options（pendingAction）；这里在插件加载/
// 请求 tick 时消费一次并执行：checkin / travel / growth。
// 自动任务：options.autoTasks + taskAt（北京时间），当天过点且没跑过就跑一轮，
// 按北京日幂等，结果写 history.json。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'
import { CONFIG_DIR, AUTH_FILE } from './pools.mjs'
import { readAuth } from './store.mjs'
import { workBuddyAccounts } from './providers.mjs'
import { beijingNow } from './schedule.mjs'
import { checkinFor } from './checkin.mjs'
import { createGrowth, growthAccountOf } from './growth.mjs'
import { loadAccounts as engineLoadAccounts, readMagpieConfigDir } from './engine/store.mjs'
import { runGrowthTasks } from './engine/tasks.mjs'

const STATE_DIR = () => join(readMagpieConfigDir() || CONFIG_DIR, 'wbkit-tasks', 'state')
const ACTIONS_FILE = () => join(STATE_DIR(), 'actions.json')
const AUTO_FILE = () => join(STATE_DIR(), 'auto-tasks.json')

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return fallback }
}
function writeJson(file, value) {
  mkdirSync(join(file, '..'), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n')
  renameSync(tmp, file)
}

// 记录每个账号最近一次动作结果，供面板在动作完成后显示状态
function recordAction(uid, action, r, now) {
  try {
    const state = readJson(ACTIONS_FILE(), {})
    const byUid = { ...(state.byUid || {}) }
    byUid[uid] = {
      at: now,
      atIso: new Date(now).toISOString(),
      action,
      ok: r?.ok !== false,
      message: String(r?.message || '').slice(0, 160),
    }
    writeJson(ACTIONS_FILE(), { ...state, byUid })
  } catch {}
}

function unitAccounts() {
  let store = {}
  try { store = readAuth(AUTH_FILE).store } catch { store = {} }
  return workBuddyAccounts(store).map(({ key, auth }) => ({ key, auth }))
}

function findUnit(uid) {
  return unitAccounts().find(({ key, auth }) => (auth?.uid && auth.uid === uid) || key === uid || String(key).endsWith(`#${uid}`)) || null
}

export function appendHistory(acct, r, leg = 'growth', trigger = 'manual') {
  try {
    const file = join(STATE_DIR(), 'history.json')
    let rows = readJson(file, [])
    if (!Array.isArray(rows)) rows = []
    rows.push({
      at: new Date().toISOString(),
      uid: acct.uid,
      nickname: acct.nickname || acct.uid,
      leg,
      state: r.ok === false ? 'fail' : r.state || 'ok',
      detail: (r.logs && r.logs.length ? r.logs[r.logs.length - 1] : r.message || r.msg) || '',
      credit: Number(r.credit ?? r.earnedCredit ?? 0) || 0,
      energy: Number(r.energy ?? 0) || 0,
      trigger,
    })
    writeJson(file, rows.slice(-500))
  } catch {}
}

async function doCheckin(uid) {
  // 签到成功后立刻写回 wbkit-checkin.json，避免页面重载时快照还没刷新、按钮变回「签到」
  function markCheckinDoneNow(auth) {
    try {
      const state = readJson(STATE_FILE, { accounts: {}, doneOn: '' })
      state.accounts ??= {}
      const now = new Date()
      const clock = beijingNow(now)
      state.accounts[auth.uid] = {
        date: clock.date,
        at: Date.now(),
        outcome: 'done',
        credit: 0,
        message: 'today',
        accountId: auth.accountId || '',
      }
      state.doneOn = clock.date
      state.lastAttemptAt = Date.now()
      state.lastRunAt = Date.now()
      writeJson(STATE_FILE, state)
    } catch {}
  }
  const hit = findUnit(uid)
  if (!hit) return { ok: false, message: '找不到账号' }
  const r = await checkinFor('workbuddy', async () => hit.auth, { takeOverCheckin: true })
  if (r.outcome === 'claimed' || r.outcome === 'done') markCheckinDoneNow(hit.auth)
  return { ok: r.outcome === 'claimed' || r.outcome === 'done', message: r.message || r.outcome, outcome: r.outcome, credit: r.credit ?? 0 }
}

async function doTravel(uid) {
  const hit = findUnit(uid)
  if (!hit) return { ok: false, message: '找不到账号' }
  const g = createGrowth({ id: 'workbuddy', name: 'WorkBuddy' })
  const acct = growthAccountOf({ id: 'workbuddy' }, hit.auth)
  const r = await g._internal.runTravelOnce(acct)
  return { ok: r.outcome !== 'failed', message: r.message || r.outcome, outcome: r.outcome }
}

async function doGrowth(uid) {
  const cfg = readMagpieConfigDir() || CONFIG_DIR
  const eng = engineLoadAccounts(cfg).find((x) => x.uid === uid)
  if (!eng) return { ok: false, message: '引擎里找不到该账号（国际版/企业号或登录态缺 access）' }
  const r = await runGrowthTasks(eng, {})
  appendHistory(eng, r, 'growth', 'manual')
  return { ok: r.ok !== false, message: `本次 +${r.credit ?? r.earnedCredit ?? 0} 积分`, credit: r.credit ?? r.earnedCredit ?? 0 }
}

// 消费面板单账号按钮（options.pendingAction = {at, uid, action}）
export async function consumePendingAction(options = {}, { now = Date.now() } = {}) {
  const pa = options?.pendingAction
  const asked = Number(pa?.at) || 0
  if (!asked) return { skipped: 'no-request' }
  const state = readJson(ACTIONS_FILE(), {})
  if (asked <= Number(state.lastAt || 0)) return { skipped: 'stale' }
  const action = String(pa.action || '')
  let r
  try {
    if (action === 'checkin') r = await doCheckin(pa.uid)
    else if (action === 'travel') r = await doTravel(pa.uid)
    else if (action === 'growth') r = await doGrowth(pa.uid)
    else r = { ok: false, message: `未知动作：${action}` }
  } catch (e) {
    r = { ok: false, message: String(e?.message ?? e).slice(0, 160) }
  }
  recordAction(pa.uid, action, r, now)
  const after = readJson(ACTIONS_FILE(), {})
  writeJson(ACTIONS_FILE(), { ...after, lastAt: asked, last: { at: now, uid: pa.uid, action, result: r } })
  return { pending: asked, action, uid: pa.uid, result: r }
}

// 每日自动成长任务：options.autoTasks + taskAt（北京时间），一天一次
// 防风控：到点后随机推迟 0–5 分钟起跑；账号之间再随机间隔 4–10 秒。
const TASK_JITTER_MS = 5 * 60_000
const ACCOUNT_GAP_MIN_MS = 4_000
const ACCOUNT_GAP_MAX_MS = 10_000
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function runAutoTasks(options = {}, { now = Date.now(), sleep = defaultSleep } = {}) {
  if (options.autoTasks !== true) return { skipped: 'off' }
  const at = String(options.taskAt || '09:10')
  const clock = beijingNow(now)
  if (clock.time < at) return { skipped: 'too-early', at }
  const state = readJson(AUTO_FILE(), {})
  if (state.doneOn === clock.date) return { skipped: 'done-today' }

  // 防风控①：当天到点后只抽一次随机推迟量并存盘，避免每天同一秒起跑
  if (state.jitterOn !== clock.date) {
    state.jitterOn = clock.date
    state.jitterAt = now + Math.floor(Math.random() * TASK_JITTER_MS)
    writeJson(AUTO_FILE(), state)
  }
  const jitterAt = Number(state.jitterAt) || 0
  if (jitterAt && now < jitterAt) return { skipped: 'waiting-jitter', at, jitterAt }

  const cfg = readMagpieConfigDir() || CONFIG_DIR
  const eligible = engineLoadAccounts(cfg).filter(
    (a) => a.provider === 'workbuddy' && !a.isApiKey && !a.enterpriseId && a.access && a.tasksEnabled !== false,
  )
  if (!eligible.length) return { skipped: 'no-account' }
  const results = []
  for (let i = 0; i < eligible.length; i++) {
    const acct = eligible[i]
    // 防风控②：账号之间随机间隔，别一串请求同时打出去
    if (i > 0) {
      const gap = ACCOUNT_GAP_MIN_MS + Math.floor(Math.random() * (ACCOUNT_GAP_MAX_MS - ACCOUNT_GAP_MIN_MS))
      try { await sleep(gap) } catch {}
    }
    try {
      const r = await runGrowthTasks(acct, {})
      appendHistory(acct, r, 'growth', 'schedule')
      recordAction(acct.uid, 'auto', { ok: r.ok !== false, message: `自动成长 +${r.credit ?? r.earnedCredit ?? 0} 积分` }, now)
      results.push({ uid: acct.uid, nickname: acct.nickname || acct.uid, ok: r.ok !== false, credit: r.credit ?? r.earnedCredit ?? 0 })
    } catch (e) {
      recordAction(acct.uid, 'auto', { ok: false, message: String(e?.message ?? e).slice(0, 120) }, now)
      results.push({ uid: acct.uid, nickname: acct.nickname || acct.uid, ok: false, error: String(e?.message ?? e).slice(0, 120) })
    }
  }
  writeJson(AUTO_FILE(), { doneOn: clock.date, jitterOn: clock.date, jitterAt, at: now, results })
  return { ran: results.length, results, doneOn: clock.date, jitterAt }
}
