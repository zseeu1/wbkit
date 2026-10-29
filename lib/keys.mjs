// 账号键放在哪个键上，magpie 和社区插件才认。
//
// magpie 插件宿主读登录态时只认两种形状（plugin-auth.json 的键）：
//
//   workbuddy             这个 provider 的第一个账号，也是默认账号
//   workbuddy#<任意后缀>   第二个及以后
//
// 检索规则是 `key === provider || key.startsWith(provider + "#")`，裸键排序在前，
// `accountKey()` 不带账号时取它；后缀内容不参与任何判断（宿主自己新建账号时用的是
// 6 位随机 base36）。所以：
//
//   1. 前缀必须是 provider 自己的 id，别的都算孤儿；
//   2. 想当「第一个账号」就用裸键，不写也行、但默认账号会变成后缀排序最小的那个。
//
// 社区插件 opencode-workbuddy-auth 通过宿主的 getAuth() 取账号，因此它认的只有第
// 1 条。wbkit 以前把 provider 写死/猜错（magpie 改过一次 id），又把后缀算成
// sha256(provider\nuid)，键就全成了孤儿。
import { createHash } from 'node:crypto'
import { providerIdOf } from './providers.mjs'

export function suffixOf(key) {
  const i = String(key).indexOf('#')
  return i === -1 ? '' : String(key).slice(i + 1)
}

// 裸键 = 这个 provider 的默认账号
export function isPrimaryKey(provider, key) {
  return String(key) === String(provider)
}

function digest(provider, uid) {
  return createHash('sha256').update(`${provider}\n${uid}`).digest('hex')
}

// 没旧后缀可用时现算一个；撞了就加长摘要，再撞就加序号。
function freshKey(provider, uid, used) {
  const hex = digest(provider, uid)
  for (let n = 7; n <= 16; n++) {
    const key = `${provider}#${hex.slice(0, n)}`
    if (!used.has(key)) return key
  }
  for (let i = 2; ; i++) {
    const key = `${provider}#${hex.slice(0, 16)}${i}`
    if (!used.has(key)) return key
  }
}

// assignKeys 给一批 {uid, provider} 定键：
//   - 同一个 uid 在 store 里已有键就沿用（只换前缀 / 挪到裸键），后缀不变；
//   - 每个 provider 留一个裸键给「第一个账号」，已被别人占着就退到 # 键；
//   - 其余账号沿用旧后缀，没有就按 uid 摘要现算。
// 返回 {plan:[{uid,provider,key,old}], renames:[{uid,from,to}]}。
// 只做规划，不动 store。
export function assignKeys(store, wants) {
  const all = store ?? {}
  const used = new Set(Object.keys(all))
  const byUid = new Map()
  for (const [key, entry] of Object.entries(all)) {
    const auth = entry?.auth ?? entry
    const uid = auth?.uid == null ? '' : String(auth.uid)
    if (uid && !byUid.has(uid)) byUid.set(uid, key)
  }

  const plan = []
  const renames = []
  const assigned = new Set()
  for (const want of wants ?? []) {
    const uid = want?.uid == null ? '' : String(want.uid)
    const provider = want?.provider ? String(want.provider) : ''
    if (!uid || !provider || assigned.has(uid)) continue
    assigned.add(uid)

    const old = byUid.get(uid) ?? null
    const oldSuffix = old ? suffixOf(old) : ''
    let key
    if (old && old === provider) {
      // 已经在这个 provider 的裸键上
      key = old
    } else if (!used.has(provider)) {
      // 裸键空着：这个账号当这个 provider 的第一个
      key = provider
    } else if (oldSuffix && !used.has(`${provider}#${oldSuffix}`)) {
      key = `${provider}#${oldSuffix}`
    } else {
      key = freshKey(provider, uid, used)
    }

    used.add(key)
    plan.push({ uid, provider, key, old })
    if (old && old !== key) renames.push({ uid, from: old, to: key })
  }
  return { plan, renames }
}

// providerOfKey 是键的 provider 前缀；给调用方省一次 import。
export function providerOfKey(key) {
  return providerIdOf(key)
}
