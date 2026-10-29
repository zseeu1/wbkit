// 账号的进出口：
//   进 —— 把 wb-switch 的导出（或任何带 access_token/refresh_token/uid 的 JSON）整份
//         粘进来，写成 magpie 自己的多账号登录态；
//   出 —— 把 magpie 里的 WorkBuddy 账号导回 wb-switch 的格式，换机器、做备份。
//
// 导出文件里有令牌，所以只在插件进程里写盘、路径记在状态里；页面只看得到路径与条数。
import { readFileSync, writeFileSync, mkdirSync, renameSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { CONFIG_DIR, AUTH_FILE, STATE_FILE } from './pools.mjs'
import { readAuth, accountsOf } from './store.mjs'
import { importRecords, recordsFromText } from './importer.mjs'
import { activeIds } from './providers.mjs'
import { setProviderIds } from './region.mjs'

export const STATE = join(CONFIG_DIR, 'wbkit-transfer.json')

function readState() {
  try {
    return JSON.parse(readFileSync(STATE, 'utf8'))
  } catch {
    return { version: 1, lastImport: null, lastExport: null, lastImportAskedAt: 0, lastExportAskedAt: 0 }
  }
}

function writeState(state) {
  mkdirSync(dirname(STATE), { recursive: true })
  const tmp = `${STATE}.tmp`
  writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8')
  renameSync(tmp, STATE)
}

// ── 进 ────────────────────────────────────────────────────────
export async function importFromText(text, { authFile = AUTH_FILE, stateFile = STATE_FILE, probeLive = false, name = 'pasted.json' } = {}) {
  const { records, error } = recordsFromText(String(text ?? ''))
  if (error) return { ok: false, error }
  // 落到 store 里实际在用的 provider id 上（workbuddy 或 codebuddy）
  try {
    setProviderIds(activeIds(readAuth(authFile).store))
  } catch {
    /* store 读不到就用默认 */
  }
  const report = await importRecords({ records, fileName: name, authFile, stateFile, probeLive })
  return {
    ok: true,
    imported: report.planned.length,
    added: report.added ?? 0,
    renamed: report.renamed?.length ?? 0,
    dropped: report.dropped.length,
    accounts: report.planned.map((p) => ({ key: p.key, label: p.label, region: p.region, provider: p.provider })),
  }
}

// 页面按钮：options.pendingImport = { at, text }，插件加载时消费一次
export async function consumePendingImport(options = {}, opts = {}) {
  const asked = Number(options?.pendingImport?.at) || 0
  const state = readState()
  if (!asked || asked <= (Number(state.lastImportAskedAt) || 0)) return { skipped: 'no-request' }
  const text = String(options?.pendingImport?.text ?? '')
  const result = await importFromText(text, { ...opts, name: 'page-paste.json' })
  const after = readState()
  after.lastImportAskedAt = asked
  after.lastImport = { at: Date.now(), ...result, accountId: undefined }
  writeState(after)
  return { pending: asked, ...result }
}

// ── 出 ────────────────────────────────────────────────────────
// wb-switch 的导出形状：一个数组，每项既有扁平字段，也有 auth_raw.auth 那份
export function toSwitchFormat(accounts) {
  return accounts.map(({ key, auth, state }) => {
    const provider = key.startsWith('workbuddy-ai') ? 'workbuddy-ai' : 'workbuddy'
    const variant = provider === 'workbuddy-ai' ? 'ai' : 'cn'
    const expiresAt = Number(auth?.expires) || 0
    const refreshExpiresAt = Number(auth?.refreshExpiresAt) || 0
    const domain = auth?.domain || (provider === 'workbuddy-ai' ? 'www.workbuddy.ai' : 'www.codebuddy.cn')
    const nickname = auth?.accountId || state?.label || ''
    const uid = auth?.uid || ''
    const now = Date.now()
    return {
      id: randomUUID(),
      uid,
      nickname,
      domain,
      variant,
      access_token: auth?.access || '',
      refresh_token: auth?.refresh || '',
      token_type: auth?.tokenType || 'Bearer',
      expiresAt,
      refreshExpiresAt,
      createdAt: now,
      refreshedAt: now,
      email: '',
      enterpriseId: auth?.enterpriseId || '',
      enterpriseName: '',
      profile_raw: { nickname, uid, phoneNumber: state?.phone || '' },
      auth_raw: {
        auth: {
          accessToken: auth?.access || '',
          refreshToken: auth?.refresh || '',
          tokenType: auth?.tokenType || 'Bearer',
          domain,
          expiresAt,
          refreshExpiresAt,
        },
      },
    }
  })
}

export function exportAccounts({ authFile = AUTH_FILE, stateFile = STATE_FILE, outFile } = {}) {
  const { store } = readAuth(authFile)
  let state = { accounts: {} }
  try {
    state = JSON.parse(readFileSync(stateFile, 'utf8'))
  } catch {
    /* 没有状态也能导 */
  }
  const rows = [...accountsOf(store, 'workbuddy'), ...accountsOf(store, 'workbuddy-ai')].map(({ key, auth }) => ({
    key,
    auth,
    state: state.accounts?.[key] ?? {},
  }))
  const payload = toSwitchFormat(rows)
  const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
  const file = outFile || join(CONFIG_DIR, `wbkit-export-${stamp}.json`)
  try {
    mkdirSync(dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    writeFileSync(tmp, JSON.stringify(payload, null, 1), 'utf8')
    renameSync(tmp, file)
  } catch (e) {
    return { ok: false, error: String(e?.message ?? e).slice(0, 160) }
  }
  try {
    statSync(file)
  } catch {
    return { ok: false, error: '导出文件写入失败' }
  }
  return { ok: true, file, count: payload.length }
}

// 页面按钮：options.pendingExport = { at }
export function consumePendingExport(options = {}) {
  const asked = Number(options?.pendingExport?.at) || 0
  const state = readState()
  if (!asked || asked <= (Number(state.lastExportAskedAt) || 0)) return { skipped: 'no-request' }
  const result = exportAccounts({ outFile: options?.pendingExport?.file || undefined })
  const after = readState()
  after.lastExportAskedAt = asked
  after.lastExport = { at: Date.now(), ...result }
  writeState(after)
  return { pending: asked, ...result }
}

export function transferSummary() {
  const s = readState()
  return { lastImport: s.lastImport ?? null, lastExport: s.lastExport ?? null }
}
