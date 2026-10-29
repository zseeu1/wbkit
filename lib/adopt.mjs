// 把 wbkit（或旧 magpie）写下的账号键搬到社区插件认的 id 上。
//
// 为什么需要：magpie 的插件登录态键是 `<provider id>#<后缀>`，而 provider id 换过
// 一次（内置 WorkBuddy → 社区插件 workbuddy），wbkit 早期版本按当时的 id 写了
// `codebuddy#…`。键还在、token 也在，但社区插件 getAuth() 只找前缀是自己声明的
// 那个 id，于是 magpie 里 WorkBuddy 一直显示未登录。
//
// 这里只改键名，不碰任何 token 字段：能走宿主的 client.auth.set 就走宿主（它会加
// 锁、写盘、通知 magpie），没有 client 时退回直接改文件（CLI / 测试）。
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AUTH_FILE, CONFIG_DIR } from './pools.mjs'
import { readAuth, writeAuth } from './store.mjs'
import { workBuddyAccounts, servedIds } from './providers.mjs'
import { assignKeys } from './keys.mjs'

export const POOL_STATE = join(CONFIG_DIR, 'workbuddy-pool', 'state.json')
export const CHECKIN_STATE = join(CONFIG_DIR, 'wbkit-checkin.json')
export const TRANSFER_STATE = join(CONFIG_DIR, 'wbkit-transfer.json')

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8')
  renameSync(tmp, file)
}

// 状态文件里的键是账号键：账号换键，状态跟着换，别让余额/签到记录变成孤儿。
function moveStateKeys(files, moves) {
  const moved = []
  for (const file of files ?? []) {
    let state
    try {
      state = JSON.parse(readFileSync(file, 'utf8'))
    } catch {
      continue
    }
    const map = state?.accounts
    if (!map || typeof map !== 'object') continue
    let changed = false
    for (const move of moves) {
      if (!map[move.from] || map[move.to]) continue
      map[move.to] = map[move.from]
      delete map[move.from]
      changed = true
    }
    if (!changed) continue
    try {
      writeJson(file, state)
      moved.push(file)
    } catch {
      /* 状态文件写不动不影响登录态 */
    }
  }
  return moved
}

// planAdoption 只做判断，不写盘。served 可注入，测试用。
// 该搬的是前缀不是已装插件声明的 id 的账号（孤儿：magpie 的 provider 列表里
// 根本没有它，社区插件的 getAuth() 也就永远看不到）。
export function planAdoption(store, served = servedIds()) {
  if (!served) return { skipped: 'no-plugin', served: null, moves: [] }
  const ids = new Set([served.cn, served.intl])
  const rows = workBuddyAccounts(store).filter((a) => a.auth?.uid && !ids.has(a.id))
  if (!rows.length) return { skipped: 'ready', served, moves: [] }

  const wants = rows.map((a) => ({ uid: a.auth.uid, provider: a.intl ? served.intl : served.cn }))
  const { renames } = assignKeys(store, wants)
  return { served, moves: renames }
}

// adoptOrphans 把 planAdoption 的结论写下去。
// client 是插件工厂拿到的 OpenCode client；有它就调 client.auth.set/remove，
// 宿主会顺带发 auth 事件，magpie 不重启也能看到账号。
export async function adoptOrphans({
  authFile = AUTH_FILE,
  stateFiles = [POOL_STATE, CHECKIN_STATE, TRANSFER_STATE],
  client = null,
  dry = false,
} = {}) {
  const { data, store } = readAuth(authFile)
  const plan = planAdoption(store)
  if (!plan.moves.length) return { ...plan, moved: 0, by: 'none' }
  if (dry) return { ...plan, moved: 0, by: 'dry' }

  const host = client?.auth
  let by = 'file'
  if (typeof host?.set === 'function' && typeof host?.remove === 'function') {
    try {
      for (const move of plan.moves) {
        const body = store[move.from]?.auth ?? store[move.from]
        if (!body) continue
        await host.set({ path: { id: move.to }, body })
        await host.remove({ path: { id: move.from } })
      }
      by = 'host'
    } catch {
      // 宿主那条路走不通就退回直接改文件，账号不能半搬半留
      by = 'file'
    }
  }

  if (by === 'file') {
    for (const move of plan.moves) {
      if (!(move.from in store)) continue
      store[move.to] = store[move.from]
      delete store[move.from]
    }
    writeAuth(authFile, data)
  }

  const states = moveStateKeys(stateFiles, plan.moves)
  return { ...plan, moved: plan.moves.length, by, states }
}
