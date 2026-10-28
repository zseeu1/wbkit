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

test('asUsage 给出 magpie 的窗口结构且不含任何令牌', () => {
  const u = asUsage(summarise(accounts, NOW), { access: 'SECRET-TOKEN', uid: 'u1', accountId: '账号A' })
  assert.equal(u.windows.length > 0, true)
  assert.equal(u.windows[0].unit, 'credits')
  assert.equal(u.signIn, 'kept')
  assert.equal(JSON.stringify(u).includes('SECRET-TOKEN'), false)
})
