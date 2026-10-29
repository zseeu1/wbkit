import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { toSwitchFormat, exportAccounts, importFromText } from '../lib/transfer.mjs'

const dir = mkdtempSync(join(tmpdir(), 'wbkit-transfer-'))
const authFile = join(dir, 'auth.json')
const stateFile = join(dir, 'state.json')

writeFileSync(authFile, JSON.stringify({
  'workbuddy#aaa': { type: 'oauth', access: 'AK1', refresh: 'RK1', expires: 1795536480000, refreshExpiresAt: 1795709280000, uid: 'u1', accountId: '账号A', domain: 'www.workbuddy.cn', tokenType: 'Bearer' },
  'workbuddy-ai#bbb': { type: 'oauth', access: 'AK2', refresh: 'RK2', expires: 1795536480000, uid: 'u2', accountId: '账号B', domain: 'www.workbuddy.ai' },
}))
writeFileSync(stateFile, JSON.stringify({ accounts: { 'workbuddy#aaa': { label: '账号A', region: 'cn', phone: '175****0205' } } }))

test('导出成 wb-switch 的形状，国内/国际都对', () => {
  const out = exportAccounts({ authFile, stateFile, outFile: join(dir, 'export.json') })
  assert.equal(out.ok, true)
  assert.equal(out.count, 2)
  const rows = JSON.parse(readFileSync(out.file, 'utf8'))
  const cn = rows.find((r) => r.uid === 'u1')
  const ai = rows.find((r) => r.uid === 'u2')
  assert.equal(cn.variant, 'cn')
  assert.equal(ai.variant, 'ai')
  assert.equal(cn.access_token, 'AK1')
  assert.equal(cn.auth_raw.auth.refreshToken, 'RK1')
  assert.equal(cn.expiresAt, 1795536480000)
  assert.equal(ai.domain, 'www.workbuddy.ai')
})

test('导出的文件能被自己再导入回去（同一个 uid 集合）', async () => {
  const file = join(dir, 'export2.json')
  exportAccounts({ authFile, stateFile, outFile: file })
  const text = readFileSync(file, 'utf8')
  const target = join(dir, 'auth2.json')
  writeFileSync(target, JSON.stringify({}))
  const r = await importFromText(text, { authFile: target, stateFile: join(dir, 'state2.json'), name: 'roundtrip.json' })
  assert.equal(r.ok, true)
  assert.equal(r.imported, 2)
  const back = JSON.parse(readFileSync(target, 'utf8'))
  const uids = Object.values(back).map((v) => v.uid).sort()
  assert.deepEqual(uids, ['u1', 'u2'])
  assert.ok(existsSync(target))
})

test('坏 JSON 给出错误而不是抛出', async () => {
  const r = await importFromText('{ not json', { authFile, stateFile })
  assert.equal(r.ok, false)
  assert.match(r.error, /不是 JSON/)
})

test('没有 access_token 的记录被拒', async () => {
  const r = await importFromText(JSON.stringify([{ uid: 'u9', nickname: 'x' }]), { authFile, stateFile })
  assert.equal(r.ok, false)
  assert.match(r.error, /没有可用账号/)
})

test('toSwitchFormat 不塞多余字段进 auth_raw', () => {
  const [row] = toSwitchFormat([{ key: 'workbuddy#k', auth: { access: 'A', refresh: 'R', uid: 'u', domain: 'www.codebuddy.cn' }, state: {} }])
  assert.deepEqual(Object.keys(row.auth_raw), ['auth'])
  assert.equal(row.auth_raw.auth.accessToken, 'A')
})
