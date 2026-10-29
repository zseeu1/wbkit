// 三个给 agent 的工具。它们经 magpie 的插件工具 MCP（/mcp/magpie/tools）暴露，
// 名字会是 wbkit_pool / wbkit_growth / wbkit_usage。
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { readAuth } from './store.mjs'
import { workBuddyAccounts, isIntlAccount } from './providers.mjs'
import { AUTH_FILE, POOL_DIR, STATE_FILE, loadPools } from './pools.mjs'
import { importRecords, recordsFromFile } from './importer.mjs'
import { probe } from './wb.mjs'
import { createGrowth, growthAccountOf, supportsGrowth } from './growth.mjs'
import { importFromText, exportAccounts } from './transfer.mjs'
import { activeIds } from './providers.mjs'
import { setProviderIds } from './region.mjs'
import { fetchUsage } from './usage.mjs'

const home = () => process.env.HOME ?? homedir()
const wbSwitchAccounts = () => join(home(), '.wb-switch', 'accounts.json')

function managed() {
  let store = {}
  try {
    store = readAuth(AUTH_FILE).store
  } catch {
    store = {}
  }
  return workBuddyAccounts(store).map(({ key, auth }) => ({ key, auth }))
}

function labelOf(key, auth) {
  return auth?.accountId || String(auth?.uid ?? '').slice(0, 8) || key
}

async function poolImport(args) {
  // 直接贴一整份导出（wb-switch 的 JSON）也行
  const pasted = String(args.text || '').trim()
  if (pasted) {
    const r = await importFromText(pasted, { authFile: AUTH_FILE, stateFile: STATE_FILE, probeLive: args.probe === true, name: 'tool-paste.json' })
    if (!r.ok) return `导入失败：${r.error}`
    return `导入 ${r.imported} 个账号（清理 ${r.dropped} 个）\n${r.accounts.map((a) => `${a.label} → ${a.key}（${a.region}）`).join('\n')}`
  }
  const source = String(args.path || '').trim()
  let records = []
  let name = ''
  if (source) {
    const got = recordsFromFile(source, source)
    records = got.records
    name = source
    if (got.error) return `导入失败：${got.error}（${source}）`
  } else {
    const pools = loadPools(POOL_DIR)
    records = pools.records ?? []
    name = 'poolDir'
    if (!records.length) {
      const fallback = wbSwitchAccounts()
      const got = recordsFromFile(fallback, 'wb-switch')
      if (!got.records.length) {
        return `没有可导入的账号。把导出文件放进 ${POOL_DIR}，或用 path 指向导出 JSON（例如 ${wbSwitchAccounts()}）。`
      }
      records = got.records
      name = fallback
    }
  }
  try {
    setProviderIds(activeIds(readAuth(AUTH_FILE).store))
  } catch {
    /* 默认 id */
  }
  const report = await importRecords({
    records,
    fileName: name,
    authFile: AUTH_FILE,
    stateFile: STATE_FILE,
    probeLive: args.probe !== false,
  })
  const lines = report.planned.map((p) => `${p.label} → ${p.key}（${p.region} · ${p.provider}${p.live?.ok ? ' · 实测通过' : ''}）`)
  const dropped = report.dropped.length ? `\n清理了 ${report.dropped.length} 个已消失的账号：${report.dropped.join(', ')}` : ''
  return `从 ${name} 导入 ${report.planned.length} 个账号\n${lines.join('\n')}${dropped}`
}

async function poolCheck(args) {
  const list = managed().filter(({ auth }) => !args.uid || String(auth?.uid ?? '').startsWith(args.uid))
  if (!list.length) return '没有已登录的 WorkBuddy 账号。'
  const lines = []
  for (const { key, auth } of list) {
    const provider = isIntlAccount(key, auth) ? 'workbuddy-ai' : 'workbuddy'
    const r = await probe(provider, auth)
    lines.push(`${labelOf(key, auth)}：${r.ok ? `可用（${r.nickname || r.uid}）` : `失效（${r.reason}）`}`)
  }
  return lines.join('\n')
}

function poolList() {
  const state = (() => {
    try {
      return JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    } catch {
      return { accounts: {} }
    }
  })()
  const rows = managed()
  if (!rows.length) return '账号池是空的。'
  return rows
    .map(({ key, auth }) => {
      const meta = state.accounts?.[key] ?? {}
      const expires = Number(auth?.expires) > 0 ? new Date(Number(auth.expires)).toLocaleString('zh-CN') : '—'
      return `${labelOf(key, auth)}  ${key}  ${meta.region ?? '?'}  到期 ${expires}`
    })
    .join('\n')
}

const growthSingleton = createGrowth({ id: 'workbuddy', name: 'WorkBuddy' })
const growthInternal = growthSingleton._internal

async function runGrowth(args) {
  const action = String(args.action || 'status')
  const accounts = managed()
    .filter(({ key, auth }) => !isIntlAccount(key, auth))
    .map(({ key, auth }) => ({ key, auth }))
    .filter(({ auth }) => supportsGrowth({ id: 'workbuddy' }, auth))
    .map(({ key, auth }) => ({ key, acct: growthAccountOf({ id: 'workbuddy' }, auth) }))
    .filter(({ acct }) => !args.uid || acct.uid.startsWith(String(args.uid)))
  if (!accounts.length) return '没有可用的 WorkBuddy 国内个人账号（需已登录、无 enterpriseId）。'

  const blocks = []
  for (const { key, acct } of accounts) {
    const head = `账号 ${labelOf(key, acct)}`
    try {
      if (action === 'status') {
        blocks.push(`${head}\n${JSON.stringify(await growthInternal.growthStatus(acct), null, 1)}`)
      } else if (action === 'task') {
        const reports = await growthInternal.runTaskTree(acct, args.code || '')
        blocks.push(`${head}\n${reports.map((r) => `${r.code}: ${r.outcome} ${r.message}${r.credit ? `（+${r.credit}）` : ''}`).join('\n') || '（无任务）'}`)
      } else if (action === 'school') {
        const reports = await growthInternal.runSchoolAll(acct, args.only || '', args.lottery === true)
        blocks.push(`${head}\n${reports.map((r) => `${r.code}: ${r.outcome} ${r.message}`).join('\n')}`)
      } else if (action === 'travel') {
        const r = await growthInternal.runTravelOnce(acct)
        blocks.push(`${head} 猫猫旅行：${r.outcome} ${r.message}`)
      } else if (action === 'streak') {
        const s = await growthInternal.runStreakOnce(acct)
        blocks.push(`${head}\n${s.lines.join('\n') || '（无可做事项）'}`)
      } else if (action === 'daily') {
        const d = await growthInternal.reportDailyActivity(acct)
        blocks.push(`${head} 每日活跃：${d.sent ? '已上报' : '今日已报过'}${d.streakDays ? `（连登 ${d.streakDays} 天）` : ''}`)
      } else {
        return `未知 action：${action}（status/task/school/travel/streak/daily）`
      }
    } catch (e) {
      blocks.push(`${head} 执行失败：${e?.message ?? e}`)
    }
  }
  return blocks.join('\n\n')
}

async function runUsage(args) {
  const days = Math.min(31, Math.max(1, Number(args.period === '1d' ? 1 : args.period === '7d' ? 7 : 30) || 30))
  const detail = Math.min(1000, Math.max(0, Number(args.detail) || 0))
  const rows = managed().filter(({ auth }) => auth?.access && (!args.uid || String(auth.uid).startsWith(String(args.uid))))
  if (!rows.length) return '没有已登录的 WorkBuddy 账号。'
  const blocks = []
  for (const { key, auth } of rows) {
    const provider = isIntlAccount(key, auth) ? 'workbuddy-ai' : 'workbuddy'
    const u = await fetchUsage(provider, auth, { days, detail })
    if (u.error) {
      blocks.push(`账号 ${labelOf(key, auth)}：${u.error}`)
      continue
    }
    const top = u.byModel.slice(0, 5).map((m) => `  ${m.model}  ${m.credit} 积分 / ${m.count} 次`).join('\n')
    blocks.push(
      `账号 ${labelOf(key, auth)} · ${u.rangeStart} → ${u.rangeEnd}\n` +
        `总计 ${u.credit} 积分 / ${u.count} 次请求\n模型 Top5:\n${top || '  （无）'}` +
        (u.requests.length ? `\n最近请求:\n${u.requests.slice(0, 10).map((r) => `  ${r.requestTime} ${r.model} ${r.credit}`).join('\n')}` : ''),
    )
  }
  return blocks.join('\n\n')
}

export const TOOLS = {
  pool: {
    description:
      'WorkBuddy 账号池：从导出 JSON（默认扫 magpie 的池目录，退回到 wb-switch 的 accounts.json）导入账号到 magpie、列出现有账号、或逐个探活。导入会写同名的多账号键，账号名优先用昵称。',
    args: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['import', 'export', 'list', 'check'], description: 'import=导入；export=导出成 wb-switch 格式；list=列表；check=探活' },
        path: { type: 'string', description: 'import 读这个 JSON；export 写到这个路径（都可选）' },
        text: { type: 'string', description: 'import 时直接给整份导出 JSON 的内容（与 path 二选一）' },
        uid: { type: 'string', description: '只处理 uid 前缀匹配的账号（check 可选）' },
        probe: { type: 'boolean', description: '导入时是否实测每个账号（默认 true）' },
      },
      required: ['action'],
    },
    async execute(args = {}) {
      const action = String(args.action || 'list')
      if (action === 'import') return { output: await poolImport(args) }
      if (action === 'export') {
        const r = exportAccounts({ authFile: AUTH_FILE, stateFile: STATE_FILE, outFile: args.path || undefined })
        if (!r.ok) return { output: `导出失败：${r.error}` }
        return { output: `已导出 ${r.count} 个账号 → ${r.file}\n（wb-switch 格式，含令牌，别上传网盘）` }
      }
      if (action === 'check') return { output: await poolCheck(args) }
      return { output: poolList() }
    },
  },

  growth: {
    description:
      'WorkBuddy 国内版成长中心：盘点任务树、点亮并领取任务、猫猫旅行、连登补签/兑换/抽奖、每日活跃上报、开学季。仅对国内个人账号生效。',
    args: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['status', 'task', 'school', 'travel', 'streak', 'daily'], description: '要做的动作' },
        code: { type: 'string', description: 'task 指定单个任务 code（可选）' },
        only: { type: 'string', description: 'school 指定任务 code（可选）' },
        lottery: { type: 'boolean', description: 'school 是否顺带抽奖（可选）' },
        uid: { type: 'string', description: '只对 uid 前缀匹配的账号执行（可选）' },
      },
      required: ['action'],
    },
    async execute(args = {}) {
      return { output: await runGrowth(args) }
    },
  },

  usage: {
    description:
      'WorkBuddy 官方请求用量：按天/模型汇总积分消耗与请求次数，可选返回最近的请求明细（不含提示词内容）。',
    args: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['1d', '7d', '30d'], description: '统计窗口，默认 30d（官方上限 31 天）' },
        uid: { type: 'string', description: '只统计 uid 前缀匹配的账号（可选）' },
        detail: { type: 'number', description: '返回多少条最近请求明细（0–1000，默认 0）' },
      },
    },
    async execute(args = {}) {
      return { output: await runUsage(args) }
    },
  },
}
