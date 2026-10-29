import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { planAdoption, adoptOrphans } from '../lib/adopt.mjs'

const SERVED = { cn: 'workbuddy', intl: 'workbuddy-ai' }
const auth = (uid, domain = 'www.workbuddy.cn') => ({ type: 'oauth', access: 'A', refresh: 'R', uid, accountId: uid, domain })
const dir = mkdtempSync(join(tmpdir(), 'wbkit-adopt-'))

test('没装社区插件：不搬（没有可认的对象）', () => {
  const plan = planAdoption({ 'codebuddy#a': auth('u1') }, null)
  assert.equal(plan.skipped, 'no-plugin')
  assert.deepEqual(plan.moves, [])
})

test('孤儿键搬到插件声明的 id：第一个账号落裸键，其余沿用后缀', () => {
  const store = {
    'codebuddy#a8cef6e': auth('u1'),
    'codebuddy#95ed2b1': auth('u2'),
    'trae-cn': { access: 'T', uid: 't1' },
  }
  const plan = planAdoption(store, SERVED)
  assert.equal(plan.skipped, undefined)
  assert.deepEqual(
    plan.moves.map((m) => `${m.from} → ${m.to}`).sort(),
    ['codebuddy#95ed2b1 → workbuddy#95ed2b1', 'codebuddy#a8cef6e → workbuddy'],
  )
})

test('键已经是插件那套 id 就不动', () => {
  const plan = planAdoption({ workbuddy: auth('u1'), 'workbuddy-ai#b': auth('u2', 'www.workbuddy.ai') }, SERVED)
  assert.equal(plan.skipped, 'ready')
  assert.deepEqual(plan.moves, [])
})

test('adoptOrphans 直接改文件：token 一字不动，状态文件的键跟着搬', async () => {
  const authFile = join(dir, 'auth.json')
  const stateFile = join(dir, 'state.json')
  writeFileSync(authFile, JSON.stringify({ 'codebuddy#a8cef6e': auth('u1') }))
  writeFileSync(stateFile, JSON.stringify({ accounts: { 'codebuddy#a8cef6e': { label: '账号A', region: 'cn' } } }))

  const r = await adoptOrphans({ authFile, stateFiles: [stateFile] })
  assert.equal(r.moved, 1)
  assert.equal(r.by, 'file')

  const store = JSON.parse(readFileSync(authFile, 'utf8'))
  assert.deepEqual(Object.keys(store), ['workbuddy'])
  assert.equal(store.workbuddy.uid, 'u1')
  assert.equal(store.workbuddy.access, 'A')
  assert.equal(store.workbuddy.refresh, 'R')

  const state = JSON.parse(readFileSync(stateFile, 'utf8'))
  assert.deepEqual(Object.keys(state.accounts), ['workbuddy'])
  assert.equal(state.accounts.workbuddy.label, '账号A')
})

test('有宿主 client 时走 client.auth.set / remove，并通知到正确账号', async () => {
  const authFile = join(dir, 'auth2.json')
  const stateFile = join(dir, 'state2.json')
  writeFileSync(authFile, JSON.stringify({ 'codebuddy#a8cef6e': auth('u1'), 'codebuddy#95ed2b1': auth('u2') }))
  writeFileSync(stateFile, JSON.stringify({ accounts: {} }))

  const calls = []
  const client = {
    auth: {
      async set(opts) {
        calls.push(['set', opts.path.id, opts.body.uid])
      },
      async remove(opts) {
        calls.push(['remove', opts.path.id])
      },
    },
  }
  const r = await adoptOrphans({ authFile, stateFiles: [stateFile], client })
  assert.equal(r.by, 'host')
  assert.deepEqual(calls, [
    ['set', 'workbuddy', 'u1'],
    ['remove', 'codebuddy#a8cef6e'],
    ['set', 'workbuddy#95ed2b1', 'u2'],
    ['remove', 'codebuddy#95ed2b1'],
  ])
  // 文件由宿主去写，这里不该自己动
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(authFile, 'utf8'))), ['codebuddy#a8cef6e', 'codebuddy#95ed2b1'])
})
