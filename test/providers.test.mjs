import { test } from 'node:test'
import assert from 'node:assert/strict'
import { workBuddyAccounts, activeIds, isIntlAccount, isWorkBuddyAccount } from '../lib/providers.mjs'

const store = {
  'trae-cn': { type: 'oauth', access: 'T', uid: 't1' },
  'workbuddy#a': { type: 'oauth', access: 'A', uid: 'u1', domain: 'www.workbuddy.cn' },
  'workbuddy-ai#b': { type: 'oauth', access: 'B', uid: 'u2', domain: 'www.workbuddy.ai' },
  'codebuddy#c': { type: 'oauth', access: 'C', uid: 'u3', domain: 'www.codebuddy.cn' },
}

test('workbuddy 与 codebuddy 两套 id 都认，trae 不混进来', () => {
  const rows = workBuddyAccounts(store)
  assert.deepEqual(rows.map((r) => r.key).sort(), ['codebuddy#c', 'workbuddy#a', 'workbuddy-ai#b'])
})

test('国际/国内按 id 或域判断', () => {
  assert.equal(isIntlAccount('workbuddy-ai#b', store['workbuddy-ai#b']), true)
  assert.equal(isIntlAccount('codebuddy#c', store['codebuddy#c']), false)
  assert.equal(isIntlAccount('x#y', { domain: 'www.codebuddy.ai' }), true)
  assert.equal(isIntlAccount('x#y', { domain: 'www.workbuddy.cn' }), false)
})

test('只靠域也能认出账号（换 id 之后的老数据）', () => {
  assert.equal(isWorkBuddyAccount('something#1', { domain: 'www.codebuddy.cn' }), true)
  assert.equal(isWorkBuddyAccount('something#1', { domain: 'api.example.com' }), false)
})

test('activeIds 给出 store 里实际在用的那套 id', () => {
  assert.deepEqual(activeIds(store), { cn: 'codebuddy', intl: 'workbuddy-ai' })
  assert.deepEqual(activeIds({ 'workbuddy#a': { access: 'A' } }), { cn: 'workbuddy', intl: 'workbuddy-ai' })
})
