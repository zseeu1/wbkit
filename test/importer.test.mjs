import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordsFromText } from '../lib/importer.mjs'
import { keyFor } from '../lib/pools.mjs'

const exportText = JSON.stringify([
  { uid: 'aaaa1111-0000', access_token: 'A', refresh_token: 'R', nickname: '账号A', expiresAt: Date.now() + 864e5, auth_raw: { domain: 'www.workbuddy.cn' } },
  { uid: 'bbbb2222-0000', access_token: 'B', refresh_token: 'R2', nickname: '账号B', auth_raw: { domain: 'www.codebuddy.cn' } },
])

test('导出里的昵称被读出来', () => {
  const { records, error } = recordsFromText(exportText)
  assert.equal(error, '')
  assert.equal(records.length, 2)
  assert.equal(records[0].nickname, '账号A')
  assert.equal(records[1].uid, 'bbbb2222-0000')
  assert.equal(records[0].domain, 'www.workbuddy.cn')
})

test('缺 access_token 的被拒', () => {
  const { records, error } = recordsFromText(JSON.stringify([{ uid: 'u', refresh_token: 'R' }]))
  assert.equal(records.length, 0)
  assert.match(error, /没有可用账号/)
})

test('账号键是 provider#7 位摘要', () => {
  const k = keyFor('workbuddy', 'aaaa1111-0000')
  assert.match(k, /^workbuddy#[0-9a-f]{7}$/)
  assert.equal(k, keyFor('workbuddy', 'aaaa1111-0000'))
  assert.notEqual(k, keyFor('workbuddy-ai', 'aaaa1111-0000'))
})
