import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { recordsFromText, importRecords } from '../lib/importer.mjs'

const batch1 = JSON.stringify([
  { uid: 'aaaa-0001', access_token: 'A', refresh_token: 'R', nickname: '账号A', expiresAt: Date.now() + 864e5, auth_raw: { domain: 'www.codebuddy.cn' } },
  { uid: 'bbbb-0002', access_token: 'B', refresh_token: 'R', nickname: '账号B', expiresAt: Date.now() + 864e5, auth_raw: { domain: 'www.codebuddy.cn' } },
])
const batch2 = JSON.stringify([
  { uid: 'cccc-0003', access_token: 'C', refresh_token: 'R', nickname: '账号C', expiresAt: Date.now() + 864e5, auth_raw: { domain: 'www.codebuddy.cn' } },
])

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-prune-'))
  const authFile = join(dir, 'auth.json')
  const stateFile = join(dir, 'state.json')
  writeFileSync(authFile, JSON.stringify({}))
  return { authFile, stateFile }
}
const keysOf = (f) => Object.keys(JSON.parse(readFileSync(f, 'utf8'))).filter((k) => k === 'workbuddy' || k.startsWith('workbuddy#'))

test('增量导入（默认）：分次加账号不会误删上一批', async () => {
  const { authFile, stateFile } = setup()
  await importRecords({ records: recordsFromText(batch1).records, authFile, stateFile, probeLive: false })
  assert.equal(keysOf(authFile).length, 2)

  const r = await importRecords({ records: recordsFromText(batch2).records, authFile, stateFile, probeLive: false })
  assert.equal(keysOf(authFile).length, 3)
  assert.equal(r.dropped.length, 0)
})

test('整包替换（prune: true）：清单里没有的旧 wbkit 账号被清掉', async () => {
  const { authFile, stateFile } = setup()
  await importRecords({ records: recordsFromText(batch1).records, authFile, stateFile, probeLive: false })
  assert.equal(keysOf(authFile).length, 2)

  const r = await importRecords({ records: recordsFromText(batch2).records, authFile, stateFile, probeLive: false, prune: true })
  assert.equal(keysOf(authFile).length, 1)
  assert.equal(r.dropped.length, 2)
})
