// wbkit — WorkBuddy 的补位插件：账号池、每日签到、猫猫旅行、成长计划、官方用量、
// 以及一个账号页。供应商与登录不在这里，交给社区插件
// @magpie-community/opencode-workbuddy-auth（它提供 workbuddy / workbuddy-ai 两个
// provider、三种登录、请求签名、续期、auth.usage）。
//
// 本插件只给 magpie 两样东西：
//   tool            三个工具：wbkit_pool / wbkit_growth / wbkit_usage
//   chat.headers    每次请求前的一个极轻的时机，用来按天跑签到、按间隔推旅行
// 页面（page/data.js）在插件加载时生成。
//
// 注意：入口导出的每个函数都会被 magpie 当作一个插件调用，所以这里只导出一个
// 插件函数，其余一律挂在 _internal 上。
import { makeTools } from './lib/tools.mjs'
import { adoptOrphans } from './lib/adopt.mjs'
import { writeView } from './lib/view.mjs'
import { maybeCheckin, consumePending } from './lib/schedule.mjs'
import { maybeTravel, consumePendingTravel } from './lib/pet.mjs'
import { consumePendingImport, consumePendingExport } from './lib/transfer.mjs'

const log = (...a) => console.log('[wbkit]', ...a)

// 页面快照：沙盒里的页面读不到账号也发不出请求，这是它唯一的数据来源。
async function refreshPage(options) {
  try {
    const written = await writeView(options ?? {})
    log('page snapshot:', written)
  } catch (e) {
    log('page snapshot failed:', e?.message ?? e)
  }
}

// 签到自己排：页面的开关写进 options，到点跑一次，一天一次。
// magpie 原生也有一套 WorkBuddy 签到（workbuddy-checkin.json），这里先看它有没有签过。
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

// 两件事都有各自的节流：签到按天、旅行按间隔，所以这里只挡住过密的调用。
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

// 账号键搬家：wbkit 早期版本按当时的 provider id 写成了 codebuddy#…，社区插件
// 只认 workbuddy / workbuddy-ai，那些账号在 magpie 里就是「未登录」。加载时顺手
// 搬一次，幂等；有 client 就走宿主的 auth.set，不重启也能看到。
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

// 页面上的「导入账号 / 导出账号」也是先把请求写进 options，这里消费一次
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
