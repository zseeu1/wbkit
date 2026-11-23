import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { summarise, asUsage } from '../lib/quota.mjs'

const fixture = JSON.parse(readFileSync(new URL('./fixtures/get-user-resource.sanitized.json', import.meta.url), 'utf8'))
const accounts = fixture.data.Response.Data.Accounts
const NOW = Date.parse('2026-10-28T15:00:00+08:00')

test('按包求和：余额、总量、过期包不计', () => {
  const s = summarise(accounts, NOW)
  assert.equal(s.balance, 110)
  assert.equal(s.size, 160)
  assert.equal(s.used, 50)
  assert.equal(s.total, 4)
  assert.equal(s.live, 3)
  assert.ok(s.runsOutAt > 0, '应该算得出最早作废时间')
})

test('同名的包合并成一档，明细仍逐个列出', () => {
  const s = summarise(accounts, NOW)
  const a = s.packages.find((p) => p.name === '示例包 A')
  assert.equal(a.balance, 60)
  assert.equal(a.size, 110)
  assert.equal(s.detail.length, 2, '余额为 0 的包不进明细')
})

test('已结束的周期不计入', () => {
  const s = summarise([{ PackageName: 'p', CapacityRemain: 100, CapacitySize: 100, CycleEndTime: '2020-01-01 00:00:00' }], NOW)
  assert.equal(s.balance, 0)
  assert.equal(s.live, 0)
})

test('2049 这类占位到期值不当成作废时间', () => {
  const s = summarise([{ PackageName: 'p', CapacityRemain: 10, CapacitySize: 10, CycleEndTime: '2027-01-01 00:00:00', DeductionEndTime: Date.parse('2049-01-01T00:00:00Z') }], NOW)
  assert.equal(s.packages[0].runsOutAt, 0)
})

test('国际版：CapacityRemain 恒等于总量时，改取 CycleCapacity* 真实读数', () => {
  const s = summarise([
    {
      PackageName: 'Free Plan Subscription',
      CapacitySize: 100,
      CapacityRemain: 100,
      CapacityUsed: 0,
      CapacitySizePrecise: 100,
      CapacityRemainPrecise: 100,
      CapacityUsedPrecise: 0,
      CycleCapacitySizePrecise: 100,
      CycleCapacityRemainPrecise: 92.77,
      CycleCapacityUsedPrecise: 7.23,
      CycleEndTime: '2026-11-30 23:59:59',
    },
  ], NOW)
  assert.equal(s.balance, 92.77)
  assert.equal(s.size, 100)
  assert.equal(s.used, 7.23)
  assert.equal(s.detail[0].balance, 92.77)
  assert.equal(s.detail[0].size, 100)
  const u = asUsage(s, { uid: 'u1', accountId: 'ai' })
  assert.equal(u.windows[0].display, '92.77 / 100')
  assert.equal(u.windows[0].balance, 92.77)
  assert.equal(u.windows[0].limit, 100)
})

test('取值优先级：CycleCapacity*Precise → CycleCapacity* → Capacity*Precise → Capacity*', () => {
  const base = { PackageName: 'p', CapacitySize: 100, CapacityRemain: 100, CapacityUsed: 0 }
  // CycleCapacityRemain（整数）要盖过 CapacityRemain
  assert.equal(summarise([{ ...base, CycleCapacityRemain: 30 }], NOW).balance, 30)
  // CycleCapacityRemainPrecise 又盖过 CycleCapacityRemain
  assert.equal(summarise([{ ...base, CycleCapacityRemain: 30, CycleCapacityRemainPrecise: 12.5 }], NOW).balance, 12.5)
})

test('三量互补：只给总量和余额时，已用按差值补出（0 是有效读数）', () => {
  const s = summarise([{ PackageName: 'p', CycleCapacitySize: 100, CycleCapacityRemain: 40, CycleEndTime: '2026-11-30 23:59:59' }], NOW)
  assert.equal(s.balance, 40)
  assert.equal(s.size, 100)
  assert.equal(s.used, 60)
})

test('国内版：两类字段同步扣减，结果与旧口径一致', () => {
  const s = summarise([
    { PackageName: 'p', CapacitySize: 100, CapacityRemain: 24, CapacityUsed: 76, CycleCapacitySize: 100, CycleCapacityRemain: 24, CycleCapacityUsed: 76, CycleEndTime: '2026-11-30 23:59:59' },
  ], NOW)
  assert.equal(s.balance, 24)
  assert.equal(s.size, 100)
  assert.equal(s.used, 76)
})

test('asUsage 给出 magpie 的窗口结构且不含任何令牌', () => {
  const u = asUsage(summarise(accounts, NOW), { access: 'SECRET-TOKEN', uid: 'u1', accountId: '账号A' })
  assert.equal(u.windows.length > 0, true)
  assert.equal(u.windows[0].unit, 'credits')
  assert.equal(u.signIn, 'kept')
  assert.equal(JSON.stringify(u).includes('SECRET-TOKEN'), false)
})
