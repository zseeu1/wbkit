// 回归：宿主新建的账号只有令牌，uid 与 accountId 都是空的。状态键如果还用
// auth.uid，这些账号会全挤在一个空键上互相覆盖，页面上只显示得出来一个。
// 现在键改成「uid 或账号键」，记录里带 key，快照按 key 对齐。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = mkdtempSync(join(tmpdir(), 'wbkit-key-'))
const cfg = join(dir, 'magpie')
mkdirSync(cfg, { recursive: true })
writeFileSync(join(cfg, 'plugin-auth.json'), JSON.stringify({
  // 两个「只有令牌」的账号：magpie 自己新建的账号就是这个形状
  'workbuddy#aaaaaaa': { type: 'oauth', access: 'A', refresh: 'R', expires: Date.now() + 864e5, domain: 'www.workbuddy.cn' },
  'workbuddy#bbbbbbb': { type: 'oauth', access: 'B', refresh: 'R', expires: Date.now() + 864e5, domain: 'www.workbuddy.cn' },
  // 一个有 uid 的老账号：键仍然是 uid，历史记录不用迁移
  'workbuddy#ccccccc': { type: 'oauth', access: 'C', refresh: 'R', expires: Date.now() + 864e5, uid: 'u3', accountId: '账号C', domain: 'www.workbuddy.cn' },
}))

const oldCfg = process.env.MAGPIE_CONFIG_DIR
process.env.MAGPIE_CONFIG_DIR = cfg

// 所有上游请求都在本地答（不联网）：签到当成功，旅行当「有猫、在家、能出门」
globalThis.fetch = async (url) => {
  const path = String(url)
  let data = { credit: 7 }
  if (path.includes('/buddy/info')) data = { buddy: { id: 'b1' } }
  else if (path.includes('/buddy/travel/status')) data = { state: 'idle', daily_limit_reached: false }
  else if (path.includes('/buddy/travel/depart')) data = { ok: true }
  return new Response(JSON.stringify({ code: 0, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const { maybeCheckin, checkinSummary, STATE_FILE } = await import('../lib/schedule.mjs')
const { maybeTravel, travelSummary, STATE_FILE: PET_STATE } = await import('../lib/pet.mjs')
const { stateKeyOf, stateRow } = await import('../lib/providers.mjs')

test.after(() => {
  if (oldCfg === undefined) delete process.env.MAGPIE_CONFIG_DIR
  else process.env.MAGPIE_CONFIG_DIR = oldCfg
  rmSync(dir, { recursive: true, force: true })
})

test('状态键：有 uid 用 uid，没有 uid 用账号键', () => {
  assert.equal(stateKeyOf('workbuddy#a', { uid: 'u1' }), 'u1')
  assert.equal(stateKeyOf('workbuddy#a', {}), 'workbuddy#a')
  assert.equal(stateKeyOf('workbuddy#a', { uid: '  ' }), 'workbuddy#a')
  assert.equal(stateKeyOf('workbuddy#a', null), 'workbuddy#a')
})

test('摘要行：老记录（键是 uid）按 uid 对齐，新记录带 key', () => {
  // 老记录：键就是 uid，记录里没有 key
  assert.deepEqual(stateRow('u1', { date: '2026-11-07' }), { date: '2026-11-07', uid: 'u1', key: '' })
  // 新记录：没有 uid 的账号，键是账号键，记录里带 key
  assert.deepEqual(stateRow('workbuddy#a', { key: 'workbuddy#a' }), { key: 'workbuddy#a', uid: '' })
  // 有 uid 的账号：键仍是 uid，同时带 key 供页面按 key 对齐
  assert.deepEqual(stateRow('u1', { key: 'workbuddy#a' }), { key: 'workbuddy#a', uid: 'u1' })
})

test('两个没有 uid 的账号签到后各记一条，不再互相覆盖', async () => {
  const stateFile = join(dir, 'checkin.json')
  const r = await maybeCheckin({ autoCheckin: true }, { force: true, stateFile })
  assert.equal(r.ran, 3)
  const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
  assert.deepEqual(Object.keys(saved.accounts).sort(), ['u3', 'workbuddy#aaaaaaa', 'workbuddy#bbbbbbb'])
  // 每条记录都带 key，页面才能按 key 对齐账号列表
  assert.equal(saved.accounts['workbuddy#aaaaaaa'].key, 'workbuddy#aaaaaaa')
  assert.equal(saved.accounts['workbuddy#bbbbbbb'].key, 'workbuddy#bbbbbbb')
  assert.equal(saved.accounts.u3.key, 'workbuddy#ccccccc')

  const s = checkinSummary(Date.now(), stateFile)
  assert.equal(s.accounts.length, 3)
  assert.equal(s.accounts.filter((a) => a.outcome === 'claimed').length, 3)
})

test('没有 uid 的账号旅行状态同样按账号键分开记', async () => {
  const stateFile = join(dir, 'travel.json')
  const r = await maybeTravel({ autoTravel: true }, { force: true, stateFile })
  assert.equal(r.ran, 3)
  const saved = JSON.parse(readFileSync(stateFile, 'utf8'))
  assert.deepEqual(Object.keys(saved.travel.accounts).sort(), ['u3', 'workbuddy#aaaaaaa', 'workbuddy#bbbbbbb'])
  assert.equal(travelSummary(Date.now(), stateFile).accounts.length, 3)
})

test('签到与旅行状态文件是同一个（插件里共用 wbkit-checkin.json）', () => {
  assert.equal(PET_STATE, STATE_FILE)
})

test('快照里没有 uid 的账号按 key 对上签到与旅行记录', async () => {
  const { viewOf } = await import('../lib/view.mjs')
  const authFile = join(cfg, 'plugin-auth.json')
  // 快照读的是插件默认状态文件（CONFIG_DIR 已被 MAGPIE_CONFIG_DIR 指到临时目录）
  writeFileSync(join(cfg, 'wbkit-checkin.json'), JSON.stringify({
    version: 1,
    accounts: {
      'workbuddy#aaaaaaa': { key: 'workbuddy#aaaaaaa', date: beijingToday(), at: Date.now(), outcome: 'claimed', credit: 7 },
      'workbuddy#bbbbbbb': { key: 'workbuddy#bbbbbbb', date: beijingToday(), at: Date.now(), outcome: 'done', credit: 0 },
    },
    travel: {
      accounts: {
        'workbuddy#aaaaaaa': { key: 'workbuddy#aaaaaaa', accountId: 'workbuddy#aaaaaaa', at: 1, outcome: 'done', message: '猫猫已派出旅行', credit: 0 },
        'workbuddy#bbbbbbb': { key: 'workbuddy#bbbbbbb', accountId: 'workbuddy#bbbbbbb', at: 1, outcome: 'skipped', message: '猫猫旅行中', credit: 0 },
      },
    },
  }))
  const view = await viewOf({ authFile, stateFile: join(dir, 'pool-state.json'), fetchQuota: true, options: {} })
  const a = view.accounts.find((x) => x.key === 'workbuddy#aaaaaaa')
  const b = view.accounts.find((x) => x.key === 'workbuddy#bbbbbbb')
  assert.equal(a.uid, '')
  // 两个账号的记录不再互相覆盖：一个 claimed 一个 done，旅行状态各是各的
  assert.equal(a.checkin?.outcome, 'claimed')
  assert.equal(b.checkin?.outcome, 'done')
  assert.equal(view.travel.accounts.find((t) => t.key === 'workbuddy#aaaaaaa')?.last?.message, '猫猫已派出旅行')
  assert.equal(view.travel.accounts.find((t) => t.key === 'workbuddy#bbbbbbb')?.last?.message, '猫猫旅行中')
})

function beijingToday() {
  return new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10)
}
