// 插件入口冒烟：在隔离 HOME 下加载 WorkBuddyKit，确认合并后工具面完整、
// 页面快照不含令牌、service=off 时不起服务。
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('WorkBuddyKit 合并后工具面 = pool/growth/usage/tasks/models，快照无令牌', async () => {
  const home = mkdtempSync(join(tmpdir(), 'wbkit-it-'))
  const cfg = join(home, '.config', 'magpie')
  mkdirSync(cfg, { recursive: true })
  writeFileSync(join(cfg, 'plugin-auth.json'), JSON.stringify({
    'workbuddy': { uid: 'u1', access: 'SECRET_ACCESS_MARKER', refresh: 'r', accountId: '小祖', domain: 'www.workbuddy.cn', expires: Date.now() + 86400000 },
  }))
  const oldHome = process.env.HOME
  process.env.HOME = home
  process.env.WBKIT_LOAD_SYNC = '1'
  try {
    const { WorkBuddyKit } = await import('../../index.mjs')
    const plugin = await WorkBuddyKit({ client: null }, { service: 'off' })
    const names = Object.keys(plugin.tool).sort()
    assert.deepEqual(names, ['growth', 'models', 'pool', 'tasks', 'usage'])
    assert.equal(typeof plugin['chat.headers'], 'function')
    const dataFile = join(process.cwd(), 'page', 'data.js')
    if (existsSync(dataFile)) {
      const text = readFileSync(dataFile, 'utf8')
      assert.ok(!text.includes('SECRET_ACCESS_MARKER'), '页面快照不能包含 access token')
    }
    // service=off 不应拉起守护进程：没有 daemon.json
    assert.equal(existsSync(join(cfg, 'wbkit-tasks', 'state', 'daemon.json')), false)
  } finally {
    process.env.HOME = oldHome
    delete process.env.WBKIT_LOAD_SYNC
    rmSync(home, { recursive: true, force: true })
  }
})
