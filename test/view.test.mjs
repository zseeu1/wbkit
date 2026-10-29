import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { viewOf, kindOf } from '../lib/view.mjs'

const dir = mkdtempSync(join(tmpdir(), 'wbkit-view-'))
const authFile = join(dir, 'auth.json')
const stateFile = join(dir, 'state.json')

writeFileSync(authFile, JSON.stringify({
  'workbuddy#aaa': { type: 'oauth', access: 'A', refresh: 'R', expires: Date.now() + 864e5, accountId: '账号A', uid: 'u1', domain: 'www.workbuddy.cn' },
  'workbuddy#bbb': { type: 'oauth', access: 'B', refresh: 'R2', expires: Date.now() + 864e5, accountId: '账号B', uid: 'u2', domain: 'www.codebuddy.cn' },
  'workbuddy-ai#ccc': { type: 'oauth', access: 'C', refresh: 'R3', expires: Date.now() + 864e5, accountId: 'intl', uid: 'u3', domain: 'www.workbuddy.ai' },
  // 社区插件的另外两种登录：桌面登录（source）与 API key（没有 access）
  'workbuddy#ddd': { type: 'oauth', source: 'desktop', access: '', refresh: '', expires: 0, accountId: '桌面账号', uid: 'u4' },
  'workbuddy#eee': { type: 'api', key: 'sk-workbuddy-secret-abcd' },
}))
writeFileSync(stateFile, JSON.stringify({ accounts: { 'workbuddy#aaa': { region: 'cn', health: 'ok' }, 'workbuddy#bbb': { region: 'cn', health: 'bad' } } }))

test('快照按账号列出、分区、健康状态，且不含令牌', async () => {
  const view = await viewOf({ authFile, stateFile, fetchQuota: false })
  assert.equal(view.totals.accounts, 5)
  assert.equal(view.totals.cn, 4)
  assert.equal(view.totals.intl, 1)
  assert.equal(view.accounts[0].label, '账号A')
  assert.equal(view.accounts[1].healthNote, '失效')
  // 社区插件登录的账号也在列表里：桌面登录用账号名，API key 只露尾四位
  const desktop = view.accounts.find((a) => a.uid === 'u4')
  const api = view.accounts.find((a) => a.kind === 'api')
  assert.equal(desktop.label, '桌面账号')
  assert.equal(desktop.kind, 'desktop')
  assert.equal(api.kind, 'api')
  assert.equal(api.label, 'API key ·abcd')
  const text = JSON.stringify(view)
  for (const secret of ['"A"', '"B"', '"C"', '"R2"', '"R3"', 'access', 'sk-workbuddy-secret-abcd']) {
    assert.equal(text.includes(secret), false, `快照里不应该出现 ${secret}`)
  }
})

test('登录方式：浏览器 / 桌面 / API key 分得开', () => {
  assert.equal(kindOf({ type: 'oauth', access: 'A' }), 'oauth')
  assert.equal(kindOf({ type: 'oauth', source: 'desktop' }), 'desktop')
  assert.equal(kindOf({ type: 'api', key: 'k' }), 'api')
  assert.equal(kindOf({ type: 'oauth' }), 'none')
})
