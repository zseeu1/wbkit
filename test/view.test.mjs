import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { viewOf } from '../lib/view.mjs'

const dir = mkdtempSync(join(tmpdir(), 'wbkit-view-'))
const authFile = join(dir, 'auth.json')
const stateFile = join(dir, 'state.json')

writeFileSync(authFile, JSON.stringify({
  'workbuddy#aaa': { type: 'oauth', access: 'A', refresh: 'R', expires: Date.now() + 864e5, accountId: '账号A', uid: 'u1', domain: 'www.workbuddy.cn' },
  'workbuddy#bbb': { type: 'oauth', access: 'B', refresh: 'R2', expires: Date.now() + 864e5, accountId: '账号B', uid: 'u2', domain: 'www.codebuddy.cn' },
  'workbuddy-ai#ccc': { type: 'oauth', access: 'C', refresh: 'R3', expires: Date.now() + 864e5, accountId: 'intl', uid: 'u3', domain: 'www.workbuddy.ai' },
}))
writeFileSync(stateFile, JSON.stringify({ accounts: { 'workbuddy#aaa': { region: 'cn', health: 'ok' }, 'workbuddy#bbb': { region: 'cn', health: 'bad' } } }))

test('快照按账号列出、分区、健康状态，且不含令牌', async () => {
  const view = await viewOf({ authFile, stateFile, fetchQuota: false })
  assert.equal(view.totals.accounts, 3)
  assert.equal(view.totals.cn, 2)
  assert.equal(view.totals.intl, 1)
  assert.equal(view.accounts[0].label, '账号A')
  assert.equal(view.accounts[1].healthNote, '失效')
  const text = JSON.stringify(view)
  for (const secret of ['"A"', '"B"', '"C"', '"R2"', '"R3"', 'access']) {
    assert.equal(text.includes(secret), false, `快照里不应该出现 ${secret}`)
  }
})
