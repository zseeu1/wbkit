import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { consumePendingTravel, travelSummary, readState } from '../lib/pet.mjs'

const dir = mkdtempSync(join(tmpdir(), 'wbkit-pet-'))

test('没有请求时不碰网络', async () => {
  const stateFile = join(dir, 'a.json')
  assert.deepEqual(await consumePendingTravel({}, { stateFile }), { skipped: 'no-request' })
})

test('旧时间戳不重复消费', async () => {
  const stateFile = join(dir, 'b.json')
  const at = Date.now()
  writeFileSync(stateFile, JSON.stringify({ version: 1, accounts: {}, travel: { accounts: {}, lastPendingAt: at } }))
  assert.deepEqual(await consumePendingTravel({ pendingTravel: { at } }, { stateFile }), { skipped: 'no-request' })
})

test('摘要只读状态，不改文件', () => {
  const stateFile = join(dir, 'c.json')
  writeFileSync(stateFile, JSON.stringify({
    version: 1, accounts: {},
    travel: { lastRunAt: 1793173600000, accounts: { u1: { accountId: '账号A', at: 1, outcome: 'done', message: '猫猫已派出旅行', credit: 0 } } },
  }))
  const s = travelSummary(Date.now(), stateFile)
  assert.equal(s.lastRunAt, 1793173600000)
  assert.equal(s.accounts[0].message, '猫猫已派出旅行')
  assert.equal(readState(stateFile).travel.accounts.u1.outcome, 'done')
})
