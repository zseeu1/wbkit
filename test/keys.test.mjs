import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assignKeys, suffixOf, isPrimaryKey } from '../lib/keys.mjs'

const auth = (uid, extra = {}) => ({ type: 'oauth', access: 'A', uid, ...extra })

test('空 store：第一个账号占裸键，第二个用 # 后缀，后缀是 7 位以上十六进制', () => {
  const { plan } = assignKeys({}, [
    { uid: 'u1', provider: 'workbuddy' },
    { uid: 'u2', provider: 'workbuddy' },
  ])
  assert.deepEqual(plan.map((p) => p.key).slice(0, 1), ['workbuddy'])
  assert.match(plan[1].key, /^workbuddy#[0-9a-f]{7,16}$/)
  assert.equal(suffixOf(plan[1].key).length >= 7, true)
  assert.equal(isPrimaryKey('workbuddy', plan[0].key), true)
})

test('裸键被别的账号占着时，新账号退到 # 键，原账号不动', () => {
  const store = { workbuddy: auth('other'), 'trae-cn': { access: 'T', uid: 't' } }
  const { plan, renames } = assignKeys(store, [{ uid: 'u1', provider: 'workbuddy' }])
  assert.match(plan[0].key, /^workbuddy#[0-9a-f]{7,16}$/)
  assert.notEqual(plan[0].key, 'workbuddy')
  assert.deepEqual(renames, [])
})

test('换 provider 前缀：旧后缀保留，裸键空着就搬成裸键', () => {
  const store = { 'codebuddy#77326a9': auth('u1') }
  const { plan, renames } = assignKeys(store, [{ uid: 'u1', provider: 'workbuddy' }])
  assert.equal(plan[0].key, 'workbuddy')
  assert.equal(plan[0].old, 'codebuddy#77326a9')
  assert.deepEqual(renames, [{ uid: 'u1', from: 'codebuddy#77326a9', to: 'workbuddy' }])
})

test('旧后缀在目标 provider 下不撞车时原样沿用', () => {
  const store = { workbuddy: auth('other'), 'codebuddy#abc1234': auth('u1') }
  const { plan, renames } = assignKeys(store, [{ uid: 'u1', provider: 'workbuddy' }])
  assert.equal(plan[0].key, 'workbuddy#abc1234')
  assert.deepEqual(renames, [{ uid: 'u1', from: 'codebuddy#abc1234', to: 'workbuddy#abc1234' }])
})

test('同一个 uid 只分配一次', () => {
  const { plan } = assignKeys({}, [
    { uid: 'u1', provider: 'workbuddy' },
    { uid: 'u1', provider: 'workbuddy-ai' },
  ])
  assert.equal(plan.length, 1)
})

test('同一个 uid 已在裸键上就当它就是默认账号，不产生改名', () => {
  const store = { workbuddy: auth('u1') }
  const { plan, renames } = assignKeys(store, [{ uid: 'u1', provider: 'workbuddy' }])
  assert.equal(plan[0].key, 'workbuddy')
  assert.deepEqual(renames, [])
})
