import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beijingNow, consumePending, checkinSummary } from '../lib/schedule.mjs'

const dir = mkdtempSync(join(tmpdir(), 'wbkit-sched-'))

test('北京时间按 Asia/Shanghai 取，不受本机时区影响', () => {
  const c = beijingNow(Date.parse('2026-10-28T01:05:00Z'))
  assert.equal(c.date, '2026-10-28')
  assert.equal(c.time, '09:05')
})

test('没有请求时 consumePending 直接跳过', async () => {
  const stateFile = join(dir, 'a.json')
  assert.deepEqual(await consumePending({}, { stateFile }), { skipped: 'no-request' })
})

test('同一个时间戳只消费一次', async () => {
  const stateFile = join(dir, 'b.json')
  const at = Date.now()
  writeFileSync(stateFile, JSON.stringify({ version: 1, accounts: {}, lastPendingAt: at }))
  assert.deepEqual(await consumePending({ pendingCheckin: { at } }, { stateFile }), { skipped: 'no-request' })
})

test('摘要给出日期、最近一次与每个账号的结果', () => {
  const stateFile = join(dir, 'c.json')
  writeFileSync(stateFile, JSON.stringify({
    version: 1, doneOn: '2026-10-28', lastRunAt: 1793172400000,
    accounts: { u1: { date: '2026-10-28', at: 1793172400000, outcome: 'done', accountId: '账号A' } },
  }))
  const s = checkinSummary(Date.parse('2026-10-28T15:32:00+08:00'), stateFile)
  assert.equal(s.doneOn, '2026-10-28')
  assert.equal(s.accounts[0].accountId, '账号A')
  assert.equal(s.accounts[0].outcome, 'done')
})
