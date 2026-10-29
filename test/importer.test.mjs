import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordsFromText, importRecords } from '../lib/importer.mjs'
import { workBuddyAccounts } from '../lib/providers.mjs'
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

test('状态文件的目录不存在时自己建（新装机器上导入不再是 ENOENT）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-import-dir-'))
  const authFile = join(dir, 'auth.json')
  writeFileSync(authFile, JSON.stringify({}))
  const stateFile = join(dir, 'nested', 'deeper', 'state.json')
  await importRecords({ records: recordsFromText(exportText).records, authFile, stateFile, probeLive: false })
  assert.equal(JSON.parse(readFileSync(stateFile, 'utf8')).accounts !== undefined, true)
})

test('导入两个国内账号：第一个落裸键（社区插件的默认账号），第二个落 # 键', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-import-'))
  const authFile = join(dir, 'auth.json')
  writeFileSync(authFile, JSON.stringify({}))
  const stateFile = join(dir, 'state.json')

  const records = recordsFromText(exportText).records
  await importRecords({ records, authFile, stateFile, probeLive: false })

  const store = JSON.parse(readFileSync(authFile, 'utf8'))
  const keys = Object.keys(store)
  assert.equal(keys.length, 2)
  assert.ok(keys.includes('workbuddy'), '第一个账号要用裸键')
  assert.match(keys.find((k) => k !== 'workbuddy'), /^workbuddy#[0-9a-f]{7,16}$/)
  // 社区插件按 provider 前缀取账号：两个都能被认到
  assert.equal(workBuddyAccounts(store).length, 2)
  assert.deepEqual(workBuddyAccounts(store).map((a) => a.id), ['workbuddy', 'workbuddy'])
})
