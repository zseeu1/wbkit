import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { importRecords } from '../lib/importer.mjs'
import { setProviderIds } from '../lib/region.mjs'

const MARK = 'workbuddy-pool'
const dir = mkdtempSync(join(tmpdir(), 'wbkit-rename-'))

function makeStore(file, keys) {
  writeFileSync(file, JSON.stringify(keys))
  return file
}

const record = (uid, nickname) => ({
  uid,
  access: 'AK',
  refresh: 'RK',
  expiresMs: Date.now() + 864e5,
  refreshExpiresMs: Date.now() + 2 * 864e5,
  domain: 'www.codebuddy.cn',
  nickname,
  tokenType: 'Bearer',
})

test('同一 uid 只换 provider 前缀，摘要不变、不算新增也不算清理', async () => {
  const authFile = makeStore(join(dir, 'a.json'), {
    'workbuddy#77326a9': { type: 'oauth', access: 'OLD', uid: 'u1', accountId: '账号A', method: MARK, pool: MARK },
  })
  const stateFile = join(dir, 'a-state.json')
  setProviderIds({ cn: 'codebuddy', intl: 'workbuddy-ai' })

  const report = await importRecords({ records: [record('u1', '账号A')], authFile, stateFile, probeLive: false })
  const store = JSON.parse(readFileSync(authFile, 'utf8'))

  assert.deepEqual(Object.keys(store), ['codebuddy#77326a9'])
  assert.equal(report.added, 0)
  assert.deepEqual(report.renamed, ['workbuddy#77326a9'])
  assert.deepEqual(report.dropped, [])
})

test('第二次导入同一份：既不新增也不改名', async () => {
  const authFile = join(dir, 'b.json')
  makeStore(authFile, {})
  const stateFile = join(dir, 'b-state.json')
  setProviderIds({ cn: 'codebuddy', intl: 'workbuddy-ai' })

  const first = await importRecords({ records: [record('u2', '账号B')], authFile, stateFile, probeLive: false })
  assert.equal(first.added, 1)
  const second = await importRecords({ records: [record('u2', '账号B')], authFile, stateFile, probeLive: false })
  assert.equal(second.added, 0)
  assert.deepEqual(second.renamed, [])
  assert.deepEqual(second.dropped, [])
  assert.equal(Object.keys(JSON.parse(readFileSync(authFile, 'utf8'))).length, 1)
})

test('导出到不存在的路径会被拒绝', async () => {
  const { exportAccounts } = await import('../lib/transfer.mjs')
  const authFile = join(dir, 'c.json')
  makeStore(authFile, {})
  const r = exportAccounts({ authFile, stateFile: join(dir, 'c-state.json'), outFile: '/no/such/dir/x.json' })
  assert.equal(r.ok, false)
})
