// 合并后的服务加固 / 生命周期 / 工具面冒烟测试。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { stateDirFor } from '../../service/lifecycle.mjs'

const here = fileURLToPath(new URL('../../service/server.mjs', import.meta.url))

async function startServer() {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-svc-'))
  mkdirSync(join(dir, 'state'), { recursive: true })
  writeFileSync(join(dir, 'plugins.json'), '{"plugins":[]}')
  writeFileSync(join(dir, 'plugin-auth.json'), '{}')
  const port = 20000 + Math.floor(Math.random() * 20000)
  const child = spawn(process.execPath, [here, '--cfg', dir, '--state', join(dir, 'state'), '--port', String(port)], { stdio: 'ignore' })
  const base = `http://127.0.0.1:${port}`
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(base + '/api/hello', { signal: AbortSignal.timeout(1000) })
      if (r.ok) return { dir, port, base, child }
    } catch {}
    await new Promise((r) => setTimeout(r, 150))
  }
  child.kill()
  throw new Error('server did not start')
}

function stop(ctx) {
  try { ctx.child.kill('SIGKILL') } catch {}
  try { rmSync(ctx.dir, { recursive: true, force: true }) } catch {}
}

test('stateDirFor 与引擎共用 <cfg>/wbkit-tasks/state', () => {
  assert.equal(stateDirFor('/cfg'), join('/cfg', 'wbkit-tasks', 'state'))
})

function rawStatus(port, hostHeader) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/api/hello', headers: { Host: hostHeader } }, (res) => {
      res.resume()
      resolve(res.statusCode)
    })
    req.on('error', reject)
    req.end()
  })
}

test('服务只接受本机 Host（防 DNS rebinding）', async () => {
  const ctx = await startServer()
  try {
    assert.equal(await rawStatus(ctx.port, 'evil.example'), 403)
    const ok = await fetch(ctx.base + '/api/hello')
    assert.equal(ok.status, 200)
    const j = await ok.json()
    assert.equal(j.name, 'wbkit')
    assert.equal(j.ready, true)
  } finally { stop(ctx) }
})

test('POST 必须带 application/json（防跨站表单提交）', async () => {
  const ctx = await startServer()
  try {
    const r = await fetch(ctx.base + '/api/run', { method: 'POST' })
    assert.equal(r.status, 403)
  } finally { stop(ctx) }
})

test('无账号时 /api/models 返回空且不报错', async () => {
  const ctx = await startServer()
  try {
    const r = await fetch(ctx.base + '/api/models')
    assert.equal(r.status, 200)
    const j = await r.json()
    assert.equal(j.cn, null)
    assert.equal(j.intl, null)
    assert.deepEqual(j.errors, {})
  } finally { stop(ctx) }
})

test('入口导出工具含 tasks 与 models', async () => {
  const { makeServiceTools } = await import('../../lib/service-tools.mjs')
  const t = makeServiceTools({ ensure: async () => ({ info: { port: 1, key: 'k' } }) })
  assert.ok(t.tasks && t.models)
  assert.deepEqual(t.tasks.args.properties.action.enum, ['status', 'run', 'wait', 'list', 'claim'])
})
