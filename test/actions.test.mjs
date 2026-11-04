import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('autoTasks 关闭时直接跳过（不碰网络）', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-act-'))
  const old = process.env.MAGPIE_CONFIG_DIR
  process.env.MAGPIE_CONFIG_DIR = dir
  try {
    const { runAutoTasks } = await import('../lib/actions.mjs')
    assert.equal((await runAutoTasks({ autoTasks: false })).skipped, 'off')
    assert.equal((await runAutoTasks({})).skipped, 'off')
  } finally {
    if (old === undefined) delete process.env.MAGPIE_CONFIG_DIR
    else process.env.MAGPIE_CONFIG_DIR = old
    rmSync(dir, { recursive: true, force: true })
  }
})

test('pendingAction：无请求 / 未知动作 都不抛', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-act-'))
  const old = process.env.MAGPIE_CONFIG_DIR
  process.env.MAGPIE_CONFIG_DIR = dir
  try {
    const { consumePendingAction } = await import('../lib/actions.mjs')
    assert.equal((await consumePendingAction({})).skipped, 'no-request')
    const r = await consumePendingAction({ pendingAction: { at: Date.now(), uid: 'u1', action: 'zzz' } })
    assert.equal(r.action, 'zzz')
    assert.equal(r.result.ok, false)
  } finally {
    if (old === undefined) delete process.env.MAGPIE_CONFIG_DIR
    else process.env.MAGPIE_CONFIG_DIR = old
    rmSync(dir, { recursive: true, force: true })
  }
})
