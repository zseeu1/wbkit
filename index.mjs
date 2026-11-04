// wbkit — WorkBuddy 一体化补位插件（无本地服务版）。
//
// 0.5.0 起去掉常驻本地服务/任务看板：所有能力都在插件进程内完成，面板数据靠
// 加载时写的一份快照（page/data.js），面板「刷新」按钮重生成快照。
//
// 供应商与登录不在这里，交给社区插件 @magpie-community/opencode-workbuddy-auth
// （workbuddy / workbuddy-ai 两个 provider）。
//
// 入口导出的每个函数都会被 magpie 当作一个插件调用，所以这里只导出一个插件函数，
// 其余一律挂在 _internal 上。
import { makeTools } from './lib/tools.mjs'
import { adoptOrphans } from './lib/adopt.mjs'
import { writeView } from './lib/view.mjs'
import { maybeCheckin, consumePending } from './lib/schedule.mjs'
import { maybeTravel, consumePendingTravel } from './lib/pet.mjs'
import { consumePendingImport, consumePendingExport } from './lib/transfer.mjs'

const log = (...a) => console.log('[wbkit]', ...a)

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
  // adopt / transfer 只读本地文件，很快；签到/旅行/快照是慢活（快照会查余额、可选拉任务），
  // 丢后台跑，避免账号多时超过 magpie 给插件的 20 秒加载上限。
  await adoptTick(input)
  await transferTick(opts)
  const backgroundInit = async () => {
    await checkinTick(opts, 'load')
    await travelTick(opts, 'load')
    await refreshPage(opts)
  }
  if (process.env.WBKIT_LOAD_SYNC === '1') await backgroundInit()
  else Promise.resolve().then(backgroundInit).catch((e) => log('background init failed:', e?.message ?? e))

  return {
    tool: makeTools(input?.client),
    // 每次走 WorkBuddy 的请求都顺带看一眼（内部 5 分钟一次 + 各自节流）
    'chat.headers': async (input) => {
      if (input?.model?.providerID === 'workbuddy') tickLater(opts, 'chat')
      return {}
    },
  }
}

// 给测试和 CLI 用；不是插件函数，magpie 不会调用它。
export const _internal = { refreshPage, checkinTick, travelTick, transferTick, adoptTick }
