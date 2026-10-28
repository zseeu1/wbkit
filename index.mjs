// wbkit — 一个包做完 WorkBuddy：供应商登录与请求、账号池、积分与到期、每日签到、
// 成长计划、官方用量。
//
// 供应商与登录来自 @magpie-community/opencode-workbuddy-auth 0.1.41（vendor/ 下原样
// 保存，MIT）；这里只包一层，把 magpie 自己的两个钩子挂上去：
//   auth.usage    积分余额与到期（供应商账号卡、magpie quota）
//   auth.checkin  每日签到（magpie 每个北京日为每个账号调一次）
// 以及三个给 agent 的工具（经 /mcp/magpie/tools 暴露）。
//
// 注意：入口导出的每个函数都会被 magpie 当作一个插件调用，所以这里只导出两个
// 插件函数，其余一律挂在 _internal 上。
import { WorkBuddyAuthPlugin as UpCN, WorkBuddyAIAuthPlugin as UpAI } from './vendor/workbuddy.mjs'
import { checkinFor } from './lib/checkin.mjs'
import { TOOLS } from './lib/tools.mjs'
import { writeView } from './lib/view.mjs'
import { maybeCheckin, consumePending } from './lib/schedule.mjs'
import { maybeTravel, consumePendingTravel } from './lib/pet.mjs'

const log = (...a) => console.log('[wbkit]', ...a)

// refreshPage 把账号、余额、积分包、签到状态写进 page/data.js。页面在沙盒里
// 读不到账号也发不出请求，所以快照是它唯一的数据来源。
async function refreshPage() {
  try {
    const written = await writeView(globalThis.__wbkitOptions ?? {})
    log('page snapshot:', written)
  } catch (e) {
    log('page snapshot failed:', e?.message ?? e)
  }
}

// 签到由插件自己排：页面的开关写进 options，这里到点就跑，一天一次。
async function checkinTick(options, why) {
  try {
    // 页面上的「立即签到」先处理：它把时间戳写进 options，重载后在这里被消费
    const pending = await consumePending(options)
    if (pending.pending) log(`checkin(manual): ${pending.results?.map((x) => `${x.accountId}=${x.outcome}`).join(' ')}`)
    const r = pending.pending ? pending : await maybeCheckin(options)
    if (r.ran && !pending.pending) log(`checkin(${why}): ${r.results.map((x) => `${x.accountId}=${x.outcome}`).join(' ')}`)
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

const wrap = (Up) => async (input, options) => {
  const hooks = await Up(input, options)
  const provider = hooks?.provider?.id ?? hooks?.auth?.provider ?? 'workbuddy'
  const opts = options ?? {}
  globalThis.__wbkitOptions = opts
  // 签到只有国内构建有，国际那个 provider 不必再排一遍
  if (provider === 'workbuddy') {
    await checkinTick(opts, provider)
    await travelTick(opts, provider)
  }
  await refreshPage()
  return {
    ...hooks,
    auth: {
      ...hooks.auth,
      refreshLead: 5 * 60 * 1000,
      // 余额与到期交给上游的 auth.usage（它带 401 自愈、企业额度、cycle/runsOut），
      // 本插件只借这个时机跑签到与旅行
      usage: async (getAuth) => {
        checkinTick(opts, 'usage')
        travelTick(opts, 'usage')
        return hooks.auth.usage(getAuth)
      },
      checkin: (getAuth) => checkinFor(provider, getAuth, opts),
    },
    tool: TOOLS,
  }
}

export const WorkBuddyAuthPlugin = wrap(UpCN)
export const WorkBuddyAIAuthPlugin = wrap(UpAI)

// 给测试和 CLI 用；不是插件函数，magpie 不会调用它。
export const _internal = { refreshPage }
