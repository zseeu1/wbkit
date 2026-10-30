// 页面快照：插件加载时把账号、余额、积分包、签到状态写成 page/data.js，
// 页面在沙盒里只读这个文件（它没有网络，也读不到账号）。
//
// 余额来自 auth.usage 用的同一个接口；写盘前只挑白名单字段，令牌一个都不留。
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AUTH_FILE, STATE_FILE } from './pools.mjs'
import { readAuth, readJsonFile } from './store.mjs'
import { workBuddyAccounts, isIntlAccount, providerIdOf } from './providers.mjs'
import { quotaFor } from './quota.mjs'
import { checkinSummary, readJournal, builtinEntry } from './schedule.mjs'
import { travelSnapshot, travelSummary } from './pet.mjs'
import { transferSummary } from './transfer.mjs'

// 用 fileURLToPath 而不是 URL.pathname：后者在 Windows 上给的是 "/C:/a/b"，
// 带前导斜杠、空格还被转义成 %20，拿去做 mkdir/writeFile 会变成 "C:\C:\a\b" 而 ENOENT，
// 于是 page/data.js 永远写不出来、账号页空白（lib/snapshot.mjs 一直是正确写法）。
const HERE = dirname(fileURLToPath(import.meta.url))
export const DATA_FILE = join(HERE, '..', 'page', 'data.js')

const REGION_LABEL = { cn: '大陆', hmt: '港澳台', intl: '国际', unknown: '未知' }
const HEALTH_NOTE = { ok: '可用', bad: '失效', missing: '登录态缺失', error: '检测失败', unchecked: '待实测' }

// 社区插件有三种登录，wbkit 能读到的只有第一种：
//   oauth（浏览器）  令牌在 store 里，余额/签到/旅行都能用
//   desktop          store 里只有一个 source 标记，令牌每次由社区插件从 WorkBuddy
//                    桌面的文件现取，wbkit 读不到，也就查不了余额
//   api（API key）   只有 key，WorkBuddy 自己的客户端用 key 也不显示积分
const QUOTA_NOTE = {
  api: 'API key 查不到余额（WorkBuddy 客户端用 key 也不显示）',
  desktop: '桌面登录：令牌在 WorkBuddy 客户端里，余额看 magpie 供应商页',
  none: '登录态没有 access 令牌',
  empty: '',
}

export function kindOf(auth) {
  if (auth?.type === 'api') return 'api'
  if (auth?.source === 'desktop') return 'desktop'
  if (auth?.access) return 'oauth'
  return 'none'
}

// api 那种没有账号名，就用 key 尾四位当标签，别把整串 key 写进页面
function apiLabel(auth) {
  const tail = String(auth?.key ?? '').slice(-4)
  return tail ? `API key ·${tail}` : 'API key'
}

function checkinJournal() {
  // magpie 把签到结果记在这里；没开过签到就不会有这个文件。
  for (const name of ['plugin-checkin.json', 'workbuddy-checkin.json']) {
    try {
      const raw = JSON.parse(readFileSync(`${process.env.HOME}/.config/magpie/${name}`, 'utf8'))
      if (raw && typeof raw === 'object') return { name, raw }
    } catch {
      /* 没有就算了 */
    }
  }
  return null
}

function checkinOf(journal, provider, uid) {
  if (!journal) return null
  const bag = journal.raw?.accounts ?? journal.raw?.providers ?? journal.raw
  const entry =
    bag?.[`workbuddy|${uid}`] ??
    bag?.[`codebuddy|${uid}`] ??
    bag?.[provider]?.accounts?.[uid] ??
    bag?.[`${provider}#${uid}`] ??
    bag?.[uid] ??
    bag?.[provider]
  if (!entry || typeof entry !== 'object') return null
  const at = Number(entry.at ?? entry.checkedAt ?? entry.lastAt ?? 0)
  const outcome = entry.outcome ?? entry.result ?? entry.last ?? ''
  if (!at && !outcome) return null
  return { at: at || 0, outcome: String(outcome || '') }
}

// magpie 原生 WorkBuddy 签到：workbuddy|<uid> → { day, at, outcome, credit, streak }
function builtinRow(uid) {
  const entry = builtinEntry(uid)
  if (!entry) return null
  return {
    at: Date.parse(entry.at) || 0,
    outcome: String(entry.outcome || ''),
    ...(entry.credit ? { credit: Number(entry.credit) } : {}),
    ...(entry.streak ? { streak: Number(entry.streak) } : {}),
    source: 'magpie',
  }
}

// magpie 内置调度的记录：workbuddy|workbuddy#4808f50 → { day, at, outcome, msg }
function journalRow(data, key) {
  const entry = data?.[`workbuddy|${key}`]
  if (!entry) return null
  return { at: Date.parse(entry.at) || 0, outcome: String(entry.outcome || ''), message: String(entry.msg || ''), source: 'magpie' }
}

function ownRow(summary, uid) {
  const hit = summary.accounts.find((a) => a.uid === uid)
  if (!hit) return null
  return { at: Number(hit.at) || 0, outcome: String(hit.outcome || ''), credit: Number(hit.credit) || 0 }
}

export async function viewOf({ authFile = AUTH_FILE, stateFile = STATE_FILE, now = Date.now(), fetchQuota = true, options = {} } = {}) {
  let store = {}
  try {
    store = readAuth(authFile).store
  } catch {
    store = {}
  }
  const state = readJsonFile(stateFile, { accounts: {} })
  const journal = checkinJournal()
  const journalData = readJournal()
  const own = checkinSummary(now)
  const travel = travelSummary(now)
  const transfer = transferSummary()

  const liveTravel = fetchQuota ? await travelSnapshot() : []
  const travelRows = liveTravel.map((t) => {
    const last = travel.accounts.find((a) => a.uid === t.uid)
    return {
      accountId: t.accountId,
      hasPet: t.hasPet,
      state: t.state,
      label: t.label,
      dailyLimitReached: t.dailyLimitReached,
      error: t.error,
      last: last ? { at: last.at, outcome: last.outcome, message: last.message, credit: last.credit || 0 } : null,
    }
  })

  const rows = workBuddyAccounts(store).map(({ key, auth }) => ({ key, auth }))
  return Promise.all(
    rows.map(async ({ key, auth }) => {
      const provider = isIntlAccount(key, auth) ? 'workbuddy-ai' : 'workbuddy'
      const meta = state.accounts?.[key] ?? {}
      // 社区插件登录的账号也在这份 store 里：按登录方式决定能不能读余额
      const kind = kindOf(auth)
      // 状态文件里的键可能还是旧的 workbuddy#…，region 缺了就按 provider / 域判
      const intl = provider === 'workbuddy-ai'
      const region = intl ? 'intl' : meta.region && meta.region !== 'intl' ? meta.region : 'cn'
      const base = {
        key,
        kind,
        uid: auth?.uid || '',
        provider,
        region,
        regionLabel: REGION_LABEL[region] ?? REGION_LABEL.unknown,
        label: auth?.accountId || meta.label || (kind === 'api' ? apiLabel(auth) : '') || String(auth?.uid ?? '').slice(0, 8) || key,
        domain: auth?.domain || meta.domain || '',
        health: meta.health ?? 'unchecked',
        healthNote: HEALTH_NOTE[meta.health ?? 'unchecked'] ?? '',
        expiresAt: Number(auth?.expires) || 0,
        refreshExpiresAt: Number(auth?.refreshExpiresAt) || 0,
        checkin:
          builtinRow(auth?.uid) ??
          journalRow(journalData, key) ??
          checkinOf(journal, provider, auth?.uid) ??
          ownRow(own, auth?.uid),
        balance: null,
        size: null,
        used: null,
        packages: [],
        packagesTotal: 0,
        fetchedAt: 0,
        error: '',
      }
      if (!fetchQuota) return base
      // 没有 access 令牌的（桌面登录 / API key）不去打接口：打也是白打，还给个假错误
      if (kind !== 'oauth') return { ...base, error: QUOTA_NOTE[kind] ?? '' }
      try {
        const usage = await quotaFor(provider, async () => auth)
        return {
          ...base,
          balance: usage.balance ?? null,
          size: usage.size ?? null,
          used: usage.used ?? null,
          packages: (usage.detail ?? []).slice(0, 4),
          packagesTotal: (usage.detail ?? []).length,
          fetchedAt: now,
          error: usage.error ?? '',
          // 能读出余额就算活着；状态文件里没有这个键时不至于全显示「待实测」
          health: meta.health ?? (usage.error ? 'error' : 'ok'),
          healthNote: HEALTH_NOTE[meta.health ?? (usage.error ? 'error' : 'ok')] ?? '',
        }
      } catch (e) {
        return { ...base, error: String(e?.message ?? e).slice(0, 160) }
      }
    }),
  ).then((accounts) => {
    const liveUids = new Set(accounts.map((a) => a.uid).filter(Boolean))
    const ok = accounts.filter((a) => a.health === 'ok').length
    const sum = (k) => Math.round(accounts.reduce((s, a) => s + (Number(a[k]) || 0), 0) * 100) / 100
    return {
      generatedAt: new Date(now).toISOString(),
      travel: {
        enabled: options.autoTravel === true,
        everyMin: Math.max(5, Number(options.travelEveryMin) || 30),
        lastRunAt: travel.lastRunAt,
        accounts: travelRows,
      },
      checkin: {
        enabled: options.autoCheckin === true,
        at: String(options.checkinAt || '09:05'),
        doneOn: own.doneOn,
        today: own.today,
        lastRunAt: own.lastRunAt,
        // 只留还存在的账号：删号或换机器之后，别把旧记录挂在这里
        accounts: own.accounts
          .filter((a) => liveUids.has(a.uid) || accounts.some((x) => x.label === a.accountId))
          .map((a) => ({ uid: a.uid, accountId: a.accountId, date: a.date, at: a.at, outcome: a.outcome, credit: a.credit || 0 })),
      },
      transfer,
      totals: {
        accounts: accounts.length,
        ok,
        balance: sum('balance'),
        size: sum('size'),
        cn: accounts.filter((a) => a.region === 'cn').length,
        intl: accounts.filter((a) => a.region === 'intl').length,
      },
      accounts,
    }
  })
}

export async function writeView(opts = {}, file = DATA_FILE) {
  const view = await viewOf({ options: opts })
  mkdirSync(dirname(file), { recursive: true })
  const body = `/* 由 wbkit 生成：只有余额与元数据，没有令牌 */\nglobalThis.WBKIT = ${JSON.stringify(view, null, 1)};\n`
  const tmp = `${file}.tmp`
  writeFileSync(tmp, body, 'utf8')
  renameSync(tmp, file)
  return file
}

export function readView(file = DATA_FILE) {
  try {
    const text = readFileSync(file, 'utf8')
    const json = text.match(/globalThis\.WBKIT\s*=\s*(\{[\s\S]*\});\s*$/)
    return JSON.parse(json ? json[1] : text)
  } catch {
    return null
  }
}
