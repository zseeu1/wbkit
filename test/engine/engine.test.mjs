// 移植自 jichie/magpie-workbuddy-tasks 的引擎：只测与本次合并相关的关键口径。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadAccounts, providerOfKey, stateDir, eligibleAccounts } from '../../lib/engine/store.mjs'
import { resolveTaskKind } from '../../lib/engine/taskkind.mjs'

test('providerOfKey 把 codebuddy 别名归一到 workbuddy', () => {
  assert.equal(providerOfKey('workbuddy'), 'workbuddy')
  assert.equal(providerOfKey('codebuddy#abc'), 'workbuddy')
  assert.equal(providerOfKey('workbuddy-ai'), 'workbuddy-ai')
  assert.equal(providerOfKey('codebuddy-ai#x'), 'workbuddy-ai')
  assert.equal(providerOfKey('trae-cn'), null)
  assert.equal(providerOfKey('wbkit-tasks'), null)
})

test('stateDir 落在 <cfg>/wbkit-tasks/state', () => {
  assert.equal(stateDir('/c'), join('/c', 'wbkit-tasks', 'state'))
})

test('loadAccounts 读 codebuddy# 键也能识别为 WorkBuddy 账号', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-eng-'))
  try {
    writeFileSync(join(dir, 'plugin-auth.json'), JSON.stringify({
      'codebuddy#aaa': { uid: 'u1', access: 'a', accountId: '小祖', domain: 'www.workbuddy.cn' },
      'workbuddy#bbb': { uid: 'u2', access: 'b', accountId: '小魏', domain: 'www.codebuddy.cn', enterpriseId: 'e1' },
      'trae-cn': { uid: 't1', access: 'x' },
    }))
    const all = loadAccounts(dir)
    assert.equal(all.length, 2)
    assert.ok(all.every((a) => a.provider === 'workbuddy'))
    const eligible = eligibleAccounts(all)
    assert.equal(eligible.length, 1) // 企业号被排除
    assert.equal(eligible[0].uid, 'u1')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('resolveTaskKind 能识别已知任务与未知任务', () => {
  assert.equal(resolveTaskKind({ code: 'chat_5' }).kind, 'chat')
  assert.ok(!resolveTaskKind({ code: 'unknown_x' }).kind)
})
