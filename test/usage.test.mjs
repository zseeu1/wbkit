import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate, windowOf, rowOf } from '../lib/usage.mjs'

test('窗口按天算，含首尾', () => {
  const w = windowOf(30, new Date('2026-10-28T15:00:00+08:00'))
  assert.equal(w.rangeEnd, '2026-10-28')
  assert.equal(w.rangeStart, '2026-09-29')
  assert.equal(w.endTime, '2026-10-28 23:59:59')
})

test('聚合按天与按模型各算一遍', () => {
  const rows = [
    { requestId: 'a', model: 'm1', credit: 2, client: 'WorkBuddy', requestTime: '2026-10-27 10:00:00' },
    { requestId: 'b', model: 'm1', credit: 3, client: 'WorkBuddy', requestTime: '2026-10-27 11:00:00' },
    { requestId: 'c', model: 'm2', credit: 6, client: 'WorkBuddy', requestTime: '2026-10-28 01:00:00' },
  ]
  const a = aggregate(rows)
  assert.equal(a.credit, 11)
  assert.equal(a.count, 3)
  assert.deepEqual(a.byDay.map((d) => d.date), ['2026-10-27', '2026-10-28'])
  assert.equal(a.byDay[0].credit, 5)
  assert.equal(a.byModel[0].model, 'm2')
})

test('只留五个字段，提示词原文一律丢掉', () => {
  const r = rowOf({ requestId: 'x', model: 'm', credit: 1, client: 'c', requestTime: '2026-10-28 02:00:00', input: 'PROMPT-TEXT', inputTrunc: 'PROMPT' })
  assert.deepEqual(Object.keys(r).sort(), ['client', 'credit', 'model', 'requestId', 'requestTime'])
  assert.equal(JSON.stringify(r).includes('PROMPT'), false)
})

test('没有 requestId 的行被忽略', () => {
  assert.equal(rowOf({ model: 'm' }), null)
})
