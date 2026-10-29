// 版面照 wb-switch 的账号页：一行汇总、按区域分档、账号卡里放大号余额和
// 陆续到期的积分包。数据全部来自插件写的 page/data.js —— 页面在沙盒里没有网络，
// 也读不到账号。
const V = globalThis.WBKIT || null
const el = (tag, cls, text) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (text != null) n.textContent = text
  return n
}

const DAY = 864e5
const days = (ms) => (ms ? Math.ceil((ms - Date.now()) / DAY) : null)
const md = (ms) => {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
const num = (n) => (n == null ? '—' : Number(n).toLocaleString('zh-CN', { maximumFractionDigits: 2 }))
const tone = (ms) => {
  const d = days(ms)
  if (d == null) return ''
  if (d <= 2) return 'urgent'
  if (d <= 10) return 'soon'
  return ''
}

const OUTCOME = { claimed: '已签到', done: '今天已签过', captcha: '要验证码', ineligible: '无资格', inactive: '未开启', failed: '失败' }
const outcomeText = (o) => OUTCOME[o] || o || '—'

const DENSITY = [
  { id: 'card', label: '卡片', icon: '▤' },
  { id: 'compact', label: '紧凑', icon: '☰' },
]
let density = 'card'

const TABS = [
  { id: 'all', label: '全部' },
  { id: 'cn', label: '国内版' },
  { id: 'intl', label: '国际版' },
]
let tab = 'all'

function accounts() {
  const rows = V?.accounts ?? []
  return tab === 'all' ? rows : rows.filter((a) => a.region === tab)
}

function paintTabs() {
  const host = document.getElementById('seg')
  host.replaceChildren()
  for (const t of TABS) {
    const b = el('button', `seg-btn${t.id === tab ? ' on' : ''}`, t.label)
    b.type = 'button'
    b.onclick = () => {
      tab = t.id
      paintTabs()
      paintOverview()
      paintAccounts()
      magpie.options.get().then((o) => magpie.options.set({ ...o, tab })).catch(() => {})
    }
    host.append(b)
  }
}

function paintOverview() {
  const host = document.getElementById('overview')
  host.replaceChildren()
  const rows = accounts()
  const balance = rows.reduce((s, a) => s + (Number(a.balance) || 0), 0)
  const size = rows.reduce((s, a) => s + (Number(a.size) || 0), 0)
  const soonest = rows.flatMap((a) => a.packages ?? []).map((p) => p.runsOutAt).filter(Boolean).sort()[0] || 0
  const cells = [
    { k: '可用积分', v: num(Math.round(balance * 100) / 100), sub: size ? `/ ${num(size)}` : '' },
    { k: '账号', v: String(rows.length), sub: `可用 ${rows.filter((a) => a.health === 'ok').length}` },
    { k: '最近作废', v: soonest ? md(soonest) : '—', sub: soonest ? `${days(soonest)} 天后` : '无临期积分' },
  ]
  for (const c of cells) {
    const box = el('div', 'ov')
    box.append(el('span', 'ov-k', c.k))
    const v = el('span', 'ov-v')
    v.append(el('strong', null, c.v))
    if (c.sub) v.append(el('span', 'ov-sub', c.sub))
    box.append(v)
    host.append(box)
  }
}

function packageRow(p) {
  const row = el('div', 'pkg')
  const head = el('div', 'pkg-head')
  head.append(el('span', 'pkg-name', p.name))
  head.append(el('span', `pkg-when ${tone(p.runsOutAt)}`, md(p.runsOutAt)))
  const amount = el('div', 'pkg-amount')
  amount.append(el('strong', null, num(p.balance)), el('span', null, ' 积分'))
  const bar = el('div', 'pkg-bar')
  const fill = el('span', `pkg-fill ${tone(p.runsOutAt)}`)
  const pct = p.size > 0 ? Math.max(2, Math.min(100, (p.balance / p.size) * 100)) : 2
  fill.style.setProperty('--w', `${pct}%`)
  bar.append(fill)
  row.append(head, amount, bar)
  return row
}

function accountCard(a) {
  const card = el('article', 'card')
  const head = el('div', 'card-top')
  const who = el('div', 'who')
  who.append(el('span', 'avatar', String(a.label || '?').slice(0, 1)))
  const names = el('div', 'names')
  names.append(el('strong', null, a.label))
  names.append(el('span', 'sub', [a.regionLabel, a.domain].filter(Boolean).join(' · ')))
  who.append(names)
  const flags = el('div', 'flags')
  flags.append(el('span', `pill ${a.health === 'ok' ? 'ok' : 'warn'}`, a.health === 'ok' ? '可用' : a.healthNote || '待实测'))
  if (a.checkin?.at) flags.append(el('span', `pill ${a.checkin.outcome === 'claimed' || a.checkin.outcome === 'done' ? 'ok' : 'warn'}`, outcomeText(a.checkin.outcome)))
  head.append(who, flags)

  const hero = el('div', 'balance')
  hero.append(el('span', 'balance-v', a.error ? '—' : num(a.balance)))
  const packs = a.packagesTotal ?? a.packages?.length ?? 0
  hero.append(el('span', 'balance-k', a.error ? a.error : `${packs} 个积分包`))
  if (a.fetchedAt) hero.append(el('span', 'balance-at', `更新 ${md(a.fetchedAt)}`))

  const packList = el('div', 'pkgs')
  if (a.error) packList.append(el('p', 'muted', a.error))
  else if (!packs) packList.append(el('p', 'muted', '没有可用的积分包'))
  else for (const p of a.packages) packList.append(packageRow(p))

  const tokenLine = el('div', 'token-line')
  const d = days(a.expiresAt)
  tokenLine.append(el('span', null, `登录态 ${md(a.expiresAt)}`))
  if (d != null) tokenLine.append(el('span', `pill ${d <= 7 ? 'warn' : ''}`, `${d} 天`))

  card.append(head, hero, el('div', 'sect-label', '近期作废'), packList, tokenLine)
  return card
}

function paintDensity() {
  const host = document.getElementById('density')
  host.replaceChildren()
  for (const d of DENSITY) {
    const b = el('button', `density-btn${d.id === density ? ' on' : ''}`, d.label)
    b.type = 'button'
    b.title = d.id === 'card' ? '卡片视图' : '紧凑视图：一行一个账号'
    b.onclick = () => {
      density = d.id
      paintDensity()
      paintAccounts()
      magpie.options.get().then((o) => magpie.options.set({ ...o, density })).catch(() => {})
    }
    host.append(b)
  }
}

// 紧凑模式：一行一个账号，账号多了也不占屏
function compactRow(a) {
  const row = el('div', 'crow')
  const who = el('div', 'c-who')
  who.append(el('span', 'avatar sm', String(a.label || '?').slice(0, 1)))
  const names = el('div', 'c-names')
  names.append(el('strong', null, a.label))
  names.append(el('span', 'sub', [a.regionLabel, a.domain].filter(Boolean).join(' · ')))
  who.append(names)

  const bal = el('div', 'c-bal')
  bal.append(el('strong', null, a.error ? '—' : num(a.balance)))
  bal.append(el('span', 'sub', `${a.packagesTotal ?? 0} 包`))

  const soon = (a.packages ?? []).map((p) => p.runsOutAt).filter(Boolean).sort()[0] || 0
  const expiry = el('div', 'c-exp')
  expiry.append(el('span', `c-when ${tone(soon)}`, soon ? md(soon) : '—'))
  const d = days(a.expiresAt)
  expiry.append(el('span', 'sub', d == null ? '登录态 —' : `登录态 ${d} 天`))

  const flags = el('div', 'c-flags')
  flags.append(el('span', `pill ${a.health === 'ok' ? 'ok' : 'warn'}`, a.health === 'ok' ? '可用' : a.healthNote || '待实测'))
  if (a.checkin?.at) flags.append(el('span', `pill ${a.checkin.outcome === 'claimed' || a.checkin.outcome === 'done' ? 'ok' : 'warn'}`, outcomeText(a.checkin.outcome)))

  row.append(who, bal, expiry, flags)
  return row
}

function paintAccounts() {
  const host = document.getElementById('accounts')
  host.replaceChildren()
  const rows = accounts()
  document.getElementById('count').textContent = String(rows.length)
  host.className = density === 'compact' ? 'rows' : 'cards'
  if (!rows.length) {
    const empty = el('div', 'empty')
    empty.append(el('strong', null, '还没有账号'), el('span', null, '用 wbkit_pool 导入导出文件，或在供应商页登录 WorkBuddy。'))
    host.append(empty)
    return
  }
  for (const a of rows) host.append(density === 'compact' ? compactRow(a) : accountCard(a))
}

function paintControl() {
  const ck = V?.checkin ?? { enabled: false, at: '09:05' }
  const toggle = document.getElementById('ck-toggle')
  const time = document.getElementById('ck-time')
  const sub = document.getElementById('ck-sub')
  const rows = document.getElementById('ck-accounts')

  toggle.checked = ck.enabled === true
  if (ck.at) time.value = ck.at

  const today = ck.accounts?.filter((a) => a.date === ck.today) ?? []
  const bad = (ck.accounts ?? []).filter((a) => a.outcome === 'failed' || a.outcome === 'captcha').slice(-1)[0]
  sub.textContent = bad
    ? `上次失败：${bad.accountId} ${outcomeText(bad.outcome)} ${md(bad.at)} —— 点右边「立即签到」重试`
    : !ck.enabled
    ? '关（打开后按设置的时间，每天替每个账号签一次）'
    : today.length
      ? `今天：${today.map((a) => `${a.accountId} ${outcomeText(a.outcome)}`).join(' · ')}`
      : `已开，${ck.at} 之后自动签`
  rows.replaceChildren()
  for (const a of (ck.accounts ?? []).slice(-4).reverse()) {
    const line = el('span', 'ck-acc')
    line.append(el('span', 'ck-name', a.accountId || a.uid))
    line.append(el('span', `pill ${a.outcome === 'claimed' || a.outcome === 'done' ? 'ok' : 'warn'}`, outcomeText(a.outcome)))
    if (a.at) line.append(el('span', 'ck-when', md(a.at)))
    rows.append(line)
  }

  const now = document.getElementById('ck-now')
  now.onclick = async () => {
    now.disabled = true
    now.textContent = '已提交…'
    sub.textContent = '已提交，宿主重载插件后开始签到…'
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, pendingCheckin: { at: Date.now() } })
      setTimeout(() => location.reload(), 6000)
    } catch {
      now.disabled = false
      now.textContent = '立即签到'
      sub.textContent = '提交失败（页面没有写权限）'
    }
  }

  const save = async (patch) => {
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, ...patch })
      sub.textContent = '已保存，下一次加载生效'
    } catch {
      sub.textContent = '保存失败（页面无写权限）'
    }
  }
  toggle.onchange = () => save({ autoCheckin: toggle.checked })
  time.onchange = () => save({ checkinAt: time.value || '09:05' })
}

function paintTravel() {
  const tv = V?.travel ?? { enabled: false, everyMin: 30, accounts: [] }
  const toggle = document.getElementById('tv-toggle')
  const every = document.getElementById('tv-every')
  const sub = document.getElementById('tv-sub')
  const rows = document.getElementById('tv-accounts')

  toggle.checked = tv.enabled === true
  every.value = String(tv.everyMin || 30)

  const TONE = { idle: '', traveling: 'ok', arrived: 'warn' }
  const lastOf = (a) => a.last?.message || ''
  sub.textContent = !tv.enabled
    ? '关（打开后按间隔自动推进一步：派出 → 到达 → 领奖）'
    : tv.lastRunAt
      ? `上次 ${md(tv.lastRunAt)} · 每 ${tv.everyMin} 分钟推进一步`
      : `已开，每 ${tv.everyMin} 分钟推进一步`

  rows.replaceChildren()
  for (const a of tv.accounts ?? []) {
    const line = el('span', 'ck-acc')
    line.append(el('span', 'ck-name', a.accountId))
    if (a.error) line.append(el('span', 'pill warn', '读取失败'))
    else {
      line.append(el('span', `pill ${TONE[a.state] || ''}`, a.label || (a.hasPet ? '未知' : '还没有猫')))
      if (a.dailyLimitReached) line.append(el('span', 'ck-when', '今日已到上限'))
      const msg = lastOf(a)
      if (msg) line.append(el('span', 'ck-when', msg))
    }
    rows.append(line)
  }
  if (!rows.children.length) rows.append(el('span', 'ck-when', '没有可旅行的账号'))

  const now = document.getElementById('tv-now')
  now.onclick = async () => {
    now.disabled = true
    now.textContent = '已提交…'
    sub.textContent = '已提交，宿主重载插件后推进一步…'
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, pendingTravel: { at: Date.now() } })
      setTimeout(() => location.reload(), 6000)
    } catch {
      now.disabled = false
      now.textContent = '推进一步'
      sub.textContent = '提交失败（页面没有写权限）'
    }
  }
  toggle.onchange = async () => {
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, autoTravel: toggle.checked })
      sub.textContent = '已保存，下一次加载生效'
    } catch {
      sub.textContent = '保存失败（页面无写权限）'
    }
  }
  every.onchange = async () => {
    const v = Math.max(5, Math.min(720, Number(every.value) || 30))
    every.value = String(v)
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, travelEveryMin: v })
      sub.textContent = '已保存，下一次加载生效'
    } catch {
      sub.textContent = '保存失败（页面无写权限）'
    }
  }
}

function paintTransfer() {
  const tf = V?.transfer ?? {}
  const sub = document.getElementById('tf-sub')
  const status = document.getElementById('tf-status')
  const importBtn = document.getElementById('tf-import')
  const exportBtn = document.getElementById('tf-export')
  const area = document.getElementById('tf-text')

  status.replaceChildren()
  const lastImport = tf.lastImport
  const lastExport = tf.lastExport
  if (lastImport?.at) {
    const ok = lastImport.ok !== false
    const line = el('span', 'ck-acc')
    line.append(el('span', `pill ${ok ? 'ok' : 'warn'}`, ok ? `导入 ${lastImport.imported} 个` : '导入失败'))
    line.append(el('span', 'ck-when', md(lastImport.at)))
    if (!ok && lastImport.error) line.append(el('span', 'ck-when', String(lastImport.error).slice(0, 60)))
    status.append(line)
  }
  if (lastExport?.at) {
    const line = el('span', 'ck-acc')
    line.append(el('span', `pill ${lastExport.ok === false ? 'warn' : 'ok'}`, lastExport.ok === false ? '导出失败' : `导出 ${lastExport.count} 个`))
    line.append(el('span', 'ck-when mono', lastExport.file ? String(lastExport.file).replace(/^.*\//, '') : ''))
    line.append(el('span', 'ck-when', md(lastExport.at)))
    status.append(line)
  }
  if (!status.children.length) sub.textContent = '把 wb-switch 的导出整份粘进来，或者把 magpie 里的账号导回去。'

  const submit = async (patch, label) => {
    importBtn.disabled = true
    exportBtn.disabled = true
    sub.textContent = `${label}，宿主重载插件后执行…`
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, ...patch })
      setTimeout(() => location.reload(), 7000)
    } catch {
      importBtn.disabled = false
      exportBtn.disabled = false
      sub.textContent = '提交失败（页面没有写权限）'
    }
  }

  importBtn.onclick = () => {
    const text = area.value.trim()
    if (!text) {
      sub.textContent = '先把导出 JSON 粘到上面的框里'
      return
    }
    submit({ pendingImport: { at: Date.now(), text } }, '已提交导入')
  }
  exportBtn.onclick = () => submit({ pendingExport: { at: Date.now() } }, '已提交导出')
}

function paintFooter() {
  document.getElementById('fetched').textContent = V?.generatedAt ? md(Date.parse(V.generatedAt)) : '—'
  document.getElementById('stamp').textContent = V?.generatedAt ? `快照 ${md(Date.parse(V.generatedAt))}` : '还没有快照'
}

async function boot() {
  try {
    await magpie.ready
    const opts = (await magpie.options.get()) || {}
    if (opts.tab && TABS.some((t) => t.id === opts.tab)) tab = opts.tab
    if (opts.density && DENSITY.some((d) => d.id === opts.density)) density = opts.density
  } catch {
    /* 沙盒外直接渲染 */
  }
  paintTabs()
  paintDensity()
  paintOverview()
  paintAccounts()
  // 没有账号时，签到与旅行没有意义，只留导入入口
  const hasAccounts = (V?.accounts?.length ?? 0) > 0
  document.getElementById('control').hidden = !hasAccounts
  document.getElementById('travel').hidden = !hasAccounts
  if (hasAccounts) {
    paintControl()
    paintTravel()
  }
  paintTransfer()
  paintFooter()
}

boot()
