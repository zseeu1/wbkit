import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readMagpieConfigDir } from '../lib/engine/store.mjs'

test('配置目录：MAGPIE_CONFIG_DIR 优先', () => {
  assert.equal(readMagpieConfigDir({ MAGPIE_CONFIG_DIR: '/tmp/magpie-cfg' }), '/tmp/magpie-cfg')
})

test('配置目录：XDG_CONFIG_HOME/magpie 次之', () => {
  assert.equal(readMagpieConfigDir({ XDG_CONFIG_HOME: '/tmp/xdg' }), '/tmp/xdg/magpie')
})

test('配置目录：无环境变量时不抛，返回存在的目录或 null', () => {
  const dir = readMagpieConfigDir({})
  assert.ok(dir === null || typeof dir === 'string')
})
