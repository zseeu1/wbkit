#!/usr/bin/env node
// 把上游 @magpie-community/opencode-workbuddy-auth 拉到 vendor/workbuddy.mjs。
// 上游改了就用它，然后跑 npm test 确认两个插件导出还在。
//   node scripts/sync-upstream.mjs              # 从本机已装的社区插件拷
//   node scripts/sync-upstream.mjs --npm        # 从 npm 下最新版
import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const TARGET = join(HERE, '..', 'vendor', 'workbuddy.mjs')
const INSTALLED = join(homedir(), '.config', 'magpie', 'plugins', 'node_modules', '@magpie-community', 'opencode-workbuddy-auth', 'index.mjs')
const useNpm = process.argv.includes('--npm')

if (useNpm) {
  const dir = mkdtempSync(join(tmpdir(), 'wbkit-upstream-'))
  execFileSync('npm', ['pack', '@magpie-community/opencode-workbuddy-auth', '--silent'], { cwd: dir, stdio: 'inherit' })
  const tgz = execFileSync('ls', [dir], { encoding: 'utf8' }).split('\n').find((f) => f.endsWith('.tgz'))
  execFileSync('tar', ['-xzf', join(dir, tgz), '-C', dir], { stdio: 'inherit' })
  copyFileSync(join(dir, 'package', 'index.mjs'), TARGET)
  console.log('已从 npm 更新', TARGET)
} else {
  if (!existsSync(INSTALLED)) {
    console.error('本机没装社区插件；改用 node scripts/sync-upstream.mjs --npm')
    process.exit(1)
  }
  const before = readFileSync(TARGET, 'utf8')
  const after = readFileSync(INSTALLED, 'utf8')
  if (before === after) {
    console.log('vendor 已是最新（与已装社区插件一致）')
  } else {
    writeFileSync(TARGET, after)
    console.log('已更新 vendor/workbuddy.mjs（来自已装的社区插件）')
  }
}

const text = readFileSync(TARGET, 'utf8')
for (const needle of ['export const WorkBuddyAuthPlugin', 'export const WorkBuddyAIAuthPlugin', 'export const _internal']) {
  if (!text.includes(needle)) {
    console.error(`上游缺少导出：${needle} —— 入口会挂，先看上游改了什么`)
    process.exit(1)
  }
}
console.log('导出检查通过：两个插件函数 + _internal 都在')
