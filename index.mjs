// wbkit — WorkBuddy 一体化补位插件。
//
// 保留原有：账号池导入/导出/adopt、账号页、每日签到（让路给原生）、猫猫旅行、
// 官方用量。供应商与登录不在这里，交给社区插件
// @magpie-community/opencode-workbuddy-auth（workbuddy / workbuddy-ai 两个 provider）。
//
// 0.4.0 并入：
//   - jichie/magpie-workbuddy-tasks 的批量任务引擎（lib/engine）与本地服务（service/）：
//     接取→点亮→轮询进度→达标领奖、任务级勾选、夜猫子、每日活跃、积分明细、风控冷却。
//   - sabercomo/magpie-workbuddy-plus 的模型目录/套餐视图（lib/models）。
//
// 服务默认「懒启动」：插件加载不起进程；调用 wbkit_tasks / wbkit_models 或从页面
// 打开看板时才拉起，空闲 30 分钟自动退出。选项 service = lazy(默认) | on | off。
//
// 注意：入口导出的每个函数都会被 magpie 当作一个插件调用，所以这里只导出一个插件
// 函数，其余一律挂在 _internal 上。
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { makeTools } from './lib/tools.mjs'
import { makeServiceTools } from './lib/service-tools.mjs'
import { adoptOrphans } from './lib/adopt.mjs'
import { writeView } from './lib/view.mjs'
import { maybeCheckin, consumePending } from './lib/schedule.mjs'
import { maybeTravel, consumePendingTravel } from './lib/pet.mjs'
import { consumePendingImport, consumePendingExport } from './lib/transfer.mjs'
import {
  ensureDaemon,
  pidAlive,
  readDaemonInfo,
  resolveCfgDir,
  shutdownDaemon,
  stateDirFor,
  writeControl,
} from './service/lifecycle.mjs'

const log = (...a) => console.log('[wbkit]', ...a)
const hereDir = () => dirname(fileURLToPath(import.meta.url))
const serviceDir = () => join(hereDir(), 'service')

// ---- 本地服务生命周期（默认懒启动） --------------------------------------

let idleTimer = null

function serviceMode(opts) {
  const m = String(opts?.service ?? 'lazy')
  return m === 'on' || m === 'off' ? m : 'lazy'
}

function daemonInfoNow() {
  try {
    return readDaemonInfo(stateDirFor(resolveCfgDir()))
  } catch {
    return null
  }
}

function serviceRunning() {
  const info = daemonInfoNow()
  return !!info && !!info.port && pidAlive(info.pid)
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(async () => {
    const info = daemonInfoNow()
    if (info) await shutdownDaemon(info).catch(() => {})
  }, 30 * 60_000)
  idleTimer.unref?.()
}

// 按需拉起服务：off 直接拒绝；lazy/on 都确保守护进程就绪；lazy 额外装空闲退出计时。
async function ensureService(opts) {
  const mode = serviceMode(opts)
  if (mode === 'off') {
    const e = new Error('后台服务已关闭（把插件选项 service 设为 lazy 或 on 后重试）')
    e.code = 'WBKIT_SERVICE_OFF'
    throw e
  }
  const cfgDir = resolveCfgDir()
  writeControl(stateDirFor(cfgDir), 'on')
  const r = await ensureDaemon({ cfgDir, pluginDir: serviceDir(), log })
  if (mode === 'lazy') scheduleIdle()
  return r
}

// 插件加载时按选项决定服务动作：on=立即起；off=停掉；lazy=什么都不做。
async function serviceTick(opts) {
  const mode = serviceMode(opts)
  try {
    if (mode === 'on') {
      const r = await ensureService(opts)
      if (r?.info) log(`service: ${r.info.host ?? '127.0.0.1'}:${r.info.port}${r.spawned ? '（已拉起）' : '（复用）'}`)
      else if (r?.error) log('service:', r.error)
    } else if (mode === 'off') {
      const cfgDir = resolveCfgDir()
      writeControl(stateDirFor(cfgDir), 'off')
      const info = daemonInfoNow()
      if (info) await shutdownDaemon(info)
    }
  } catch (e) {
    log('service tick failed:', e?.message ?? e)
  }
}

// ---- 页面快照 -------------------------------------------------------------

async function refreshPage(options) {
  try {
    const written = await writeView(options ?? {})
    log('page snapshot:', written)
  } catch (e) {
    log('page snapshot failed:', e?.message ?? e)
  }
}

// ---- 签到 / 旅行：页面开关写进 options，到点跑一次 ----------------------

async function checkinTick(options, why) {
  try {
    const pending = await consumePending(options)
    if (pending.pending) {
      log(`checkin(manual): ${(pending.results ?? []).map((x) => `${x.accountId}=${x.outcome}`).join(' ')}`)
      return pending
    }
    const r = await maybeCheckin(options)
    if (r.ran) log(`checkin(${why}): ${r.results.map((x) => `${x.accountId}=${x.outcome}`).join(' ')}`)
    return r
  } catch (e) {
    log('checkin failed:', e?.message ?? e)
    return { skipped: 'error' }
  }
}

async function travelTick(options, why) {
  // 服务在跑时旅行交给引擎的北京时间窗口（09/21），这里的间隔推进让路，避免同账号重复旅行。
  if (serviceRunning()) return { skipped: 'service' }
  try {
    const pending = await consumePendingTravel(options)
    if (pending.pending) {
      log(`travel(manual): ${(pending.results ?? []).map((x) => `${x.accountId}=${x.outcome}`).join(' ')}`)
      return pending
    }
    const r = await maybeTravel(options)
    if (r.ran) log(`travel(${why}): ${r.results.map((x) => `${x.accountId}=${x.outcome}`).join(' ')}`)
    return r
  } catch (e) {
    log('travel failed:', e?.message ?? e)
    return { skipped: 'error' }
  }
}

const TICK_GAP_MS = 5 * 60_000
let lastTickAt = 0
let ticking = false

function tickLater(options, why) {
  if (ticking) return
  const now = Date.now()
  if (now - lastTickAt < TICK_GAP_MS) return
  lastTickAt = now
  ticking = true
  Promise.resolve()
    .then(() => checkinTick(options, why))
    .then(() => travelTick(options, why))
    .catch(() => {})
    .finally(() => {
      ticking = false
    })
}

// ---- 账号键搬家 / 导入导出 ------------------------------------------------

async function adoptTick(input) {
  try {
    const r = await adoptOrphans({ client: input?.client })
    if (r.moved) log(`adopt(${r.by}): ${r.moved} 个账号 → ${r.served.cn}/${r.served.intl}`)
    return r
  } catch (e) {
    log('adopt failed:', e?.message ?? e)
    return { skipped: 'error' }
  }
}

async function transferTick(options) {
  try {
    const imported = await consumePendingImport(options)
    if (imported.pending) log(`import: ${imported.ok ? `${imported.imported} 个账号` : imported.error}`)
    const exported = consumePendingExport(options)
    if (exported.pending) log(`export: ${exported.ok ? `${exported.count} 个账号 → ${exported.file}` : exported.error}`)
    return { imported, exported }
  } catch (e) {
    log('transfer failed:', e?.message ?? e)
    return { skipped: 'error' }
  }
}

export const WorkBuddyKit = async (input, options) => {
  const opts = options ?? {}
  await adoptTick(input)
  await transferTick(opts)
  await checkinTick(opts, 'load')
  await travelTick(opts, 'load')
  await refreshPage(opts)
  await serviceTick(opts)

  return {
    tool: {
      ...makeTools(input?.client),
      ...makeServiceTools({ ensure: () => ensureService(opts), log }),
    },
    // 每次走 WorkBuddy 的请求都顺带看一眼（内部 5 分钟一次 + 各自节流）
    'chat.headers': async (input) => {
      if (input?.model?.providerID === 'workbuddy') tickLater(opts, 'chat')
      return {}
    },
  }
}

// 给测试和 CLI 用；不是插件函数，magpie 不会调用它。
export const _internal = {
  refreshPage,
  checkinTick,
  travelTick,
  transferTick,
  adoptTick,
  serviceTick,
  ensureService,
  serviceRunning,
}
