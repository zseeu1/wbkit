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
  amount.append(el('strong', null, num(p.balance ?? p.remain)), el('span', null, ' 积分'))
  const bar = el('div', 'pkg-bar')
  const fill = el('span', `pkg-fill ${tone(p.runsOutAt)}`)
  const sizeN = Number(p.size) || 0, balN = Number(p.balance ?? p.remain) || 0
  const pct = sizeN > 0 ? Math.max(2, Math.min(100, (balN / sizeN) * 100)) : 2
  fill.style.setProperty('--w', `${pct}%`)
  bar.append(fill)
  row.append(head, amount, bar)
  return row
}

function actionZh(a) {
  return { checkin: '签到', travel: '旅行', growth: '成长', auto: '自动成长' }[a] || a
}

// 今天是否已签到：已签到时不再显示「签到」按钮，避免和状态胶囊重复
function checkedToday(a) {
  const c = a?.checkin
  if (c && (c.outcome === 'done' || c.outcome === 'claimed')) {
    const today = V?.checkin?.today
    if (c.date) { if (c.date === today) return true }
    else if (c.at) { if (new Date(c.at).toDateString() === new Date().toDateString()) return true }
    else return true
  }
  const la = a?.lastAction
  if (la && la.action === 'checkin' && la.ok) {
    const at = Number(la.at) || Date.parse(la.atIso || '')
    if (Number.isFinite(at) && new Date(at).toDateString() === new Date().toDateString()) return true
  }
  return false
}

async function triggerAction(a, action) {
  try {
    const opts = (await magpie.options.get()) || {}
    await magpie.options.set({ ...opts, pendingAction: { at: Date.now(), uid: a.key || a.uid, action } })
    setTimeout(() => { try { location.reload() } catch {} }, 10000)
  } catch {}
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
  flags.append(el('span', `pill ${a.error || a.health === 'error' ? 'warn' : a.health === 'ok' ? 'ok' : 'warn'}`, a.error ? '登录异常' : a.health === 'ok' ? '可用' : a.healthNote || '待实测'))
  head.append(who, flags)

  const hero = el('div', 'balance')
  hero.append(el('span', 'balance-v', a.error ? '—' : num(a.balance)))
  const packs = a.packagesTotal ?? a.packages?.length ?? 0
  hero.append(el('span', 'balance-k', a.error ? a.error : `${packs} 个积分包`))
  if (a.fetchedAt) hero.append(el('span', 'balance-at', `更新 ${md(a.fetchedAt)}`))

  const packList = el('div', 'pkgs')
  if (a.error) packList.append(el('p', 'muted', a.error))
  else if (!packs) packList.append(el('p', 'muted', '没有可用的积分包'))
  else for (const p of a.packages.slice(0, 5)) packList.append(packageRow(p))

  const tokenLine = el('div', 'token-line')
  const d = days(a.expiresAt)
  tokenLine.append(el('span', null, `登录态 ${md(a.expiresAt)}`))
  if (d != null) tokenLine.append(el('span', `pill ${d <= 7 ? 'warn' : ''}`, `${d} 天`))

  const acts = el('div', 'card-actions')
  acts.style.cssText = 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap'
  const actionDone = (action, a) => {
    if (action === 'checkin') return checkedToday(a)
    if (action === 'travel') {
      const tv = (V?.travel?.accounts || []).find((x) => a.label && x.accountId === a.label)
      const isTraveling = !!(tv && tv.state === 'traveling')
      const la = a.lastAction
      return isTraveling || (la && la.action === 'travel' && la.ok)
    }
    if (action === 'growth') {
      const ts = a.taskStats
      const allDone = !!(ts && ts.done === ts.total && ts.notAccepted === 0)
      const la = a.lastAction
      return allDone || (la && la.action === 'growth' && la.ok)
    }
    return false
  }
  for (const [action, label] of [['checkin', '签到'], ['travel', '旅行'], ['growth', '成长']]) {
    const done = actionDone(action, a)
    btn.type = 'button'
    btn.disabled = done
    btn.style.cssText = 'font-size:12px;padding:5px 12px;border-radius:8px'
    if (!done) btn.onclick = () => {
      btn.disabled = true
      btn.textContent = '已提交'
      triggerAction(a, action)
    }
    acts.append(btn)
  }
  card.append(head, hero, el('div', 'sect-label', '近期作废'), packList, tokenLine, acts)
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
function compactRow(a, initialOpen = false) {
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
  flags.append(el('span', `pill ${a.error || a.health === 'error' ? 'warn' : a.health === 'ok' ? 'ok' : 'warn'}`, a.error ? '登录异常' : a.health === 'ok' ? '可用' : a.healthNote || '待实测'))


  const acts = el('div', 'c-acts')
  const actionDone = (action, a) => {
    if (action === 'checkin') return checkedToday(a)
    if (action === 'travel') {
      const tv = (V?.travel?.accounts || []).find((x) => a.label && x.accountId === a.label)
      return !!(tv && tv.state === 'traveling')
    }
    if (action === 'growth') {
      const ts2 = a.taskStats
      const allDone = !!(ts2 && ts2.done === ts2.total && ts2.notAccepted === 0)
      const la = a.lastAction
      return allDone || (la && la.action === 'growth' && la.ok)
    }
    return false
  }
  for (const [action, label] of [['checkin', '签到'], ['travel', '旅行'], ['growth', '成长']]) {
    const done = actionDone(action, a)
    const btn = el('button', 'btn ghost', done ? (action === 'checkin' ? '已签到' : action === 'travel' ? '旅行中' : '已完成') : label)
    btn.type = 'button'
    btn.disabled = done
    btn.style.cssText = 'font-size:11px;padding:3px 9px;border-radius:7px;white-space:nowrap'
    if (!done) btn.onclick = () => {
      btn.disabled = true
      btn.textContent = '已提交'
      triggerAction(a, action)
    }
    acts.append(btn)
  }

  const chev = el('button', 'c-chevron', '›')
  chev.type = 'button'
  chev.setAttribute('aria-label', '展开详情')
  acts.append(chev)

  const detail = el('div', 'c-detail')
  const inner = el('div', 'c-detail-in')
  const grid = el('div', 'c-detail-grid')

  const sec = (title) => {
    const w = el('div', 'c-sec')
    w.append(el('div', 'c-sec-h', title))
    return w
  }
  const kv = (...nodes) => {
    const d = el('div', 'c-kv')
    for (const n of nodes) if (n != null) d.append(n)
    return d
  }

  // 左：积分包按名称聚合（同一个包重复出现很多行会很乱）
  const left = el('div', 'c-col')
  const groups = new Map()
  for (const p of a.packages || []) {
    const k = p.name || '积分包'
    const g = groups.get(k) || { name: k, balance: 0, count: 0, runsOutAt: 0 }
    g.balance += Number(p.balance) || 0
    g.count++
    const t = Number(p.runsOutAt) || 0
    if (t && (!g.runsOutAt || t < g.runsOutAt)) g.runsOutAt = t
    groups.set(k, g)
  }
  const list = [...groups.values()].sort((x, y) => (x.runsOutAt || Infinity) - (y.runsOutAt || Infinity))
  const overview = sec('积分概览')
  overview.append(kv(el('span', null, `${num(a.balance)} / ${num(a.size)} 可用`)))
  const meter = el('div', 'c-meter')
  const fill = el('span')
  const pct = Number(a.size) > 0 ? Math.max(2, Math.min(100, (Number(a.balance) / Number(a.size)) * 100)) : 2
  fill.style.width = `${pct}%`
  meter.append(fill)
  overview.append(meter)
  left.append(overview)

  const pk = sec(`积分包 · 共 ${a.packagesTotal ?? 0} 个`)
  if ((a.packagesTotal ?? 0) > (a.packages?.length ?? 0)) pk.append(el('div', 'c-pkg-sub', `已载入最近到期的 ${a.packages.length} 个`))
  if (list.length) {
    for (const g of list.slice(0, 4)) {
      const box = el('div', 'c-pkg-group')
      const top = el('div', 'c-pkg-top')
      top.append(el('span', 'c-pkg-name', g.name), el('span', 'c-pkg-amt', `${num(g.balance)} 积分`))
      box.append(top, el('div', 'c-pkg-sub', `${g.count} 个包${g.runsOutAt ? ` · 最近 ${md(g.runsOutAt)} 到期` : ' · 长期有效'}`))
      pk.append(box)
    }
    if (list.length > 4) pk.append(el('div', 'c-pkg-sub', `另有 ${list.length - 4} 类积分包`))
  } else pk.append(el('p', 'muted', '没有可用的积分包'))
  left.append(pk)

  // 右：签到 / 成长 / 旅行 / 最近动作
  const right = el('div', 'c-col')
  const ci = (V?.checkin?.accounts || []).find((x) => (a.uid && x.uid === a.uid) || (a.label && x.accountId === a.label))
  const ck = sec('每日签到')
  ck.append(kv(el('span', `pill ${ci && (ci.outcome === 'done' || ci.outcome === 'claimed') ? 'ok' : 'warn'}`, ci ? outcomeText(ci.outcome) : checkedToday(a) ? '已签到' : '未签到'), el('span', 'c-muted', ci?.at ? md(ci.at) : '')))
  right.append(ck)

  const ts = a.taskStats
  const gr = sec('成长')
  gr.append(kv(el('span', null, ts ? `任务 ${ts.done}/${ts.total}` : a.tasksError ? '读取失败' : '暂无任务快照'), el('span', 'c-muted', ts ? `进行中 ${ts.active} · 待接取 ${ts.notAccepted}` : '')))
  for (const t of (a.tasks || []).filter((x) => !(x.target > 0 && x.current >= x.target)).slice(0, 3)) {
    const row = el('div', 'c-task-row')
    row.append(el('span', 'c-task-name', t.title), el('span', 'c-task-meta', `${t.current}/${t.target}${t.reward ? ` · +${t.reward}` : ''}`))
    gr.append(row)
  }
  right.append(gr)

  const tv = (V?.travel?.accounts || []).find((x) => a.label && x.accountId === a.label)
  const tr = sec('猫猫旅行')
  tr.append(kv(el('span', null, tv?.label || '—'), el('span', 'c-muted', tv?.last?.message || '')))
  right.append(tr)



  grid.append(left, right)
  inner.append(grid)
  detail.append(inner)
    detail.setAttribute('aria-hidden', 'true')

  let open = !!initialOpen
  const apply = () => {
    detail.classList.toggle('open', open)
    detail.setAttribute('aria-hidden', String(!open))
    row.setAttribute('aria-expanded', String(open))
    chev.style.transform = open ? 'rotate(90deg)' : ''
  }
  row.addEventListener('click', (e) => {
    if (e.target.closest('button')) return
    open = !open
    apply()
  })
  chev.addEventListener('click', (e) => {
    e.stopPropagation()
    open = !open
    apply()
  })
  apply()

  row.append(who, bal, expiry, flags, acts)
  return [row, detail]
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
  rows.forEach((a, i) => {
    if (density === 'compact') {
      const [r, d] = compactRow(a, i === 0)
      host.append(r, d)
    } else {
      host.append(accountCard(a))
    }
  })
}

function paintControl() {
  const ck = V?.checkin ?? { enabled: false, at: '09:05' }
  const toggle = document.getElementById('ck-toggle')
  const time = document.getElementById('ck-time')
  const sub = document.getElementById('ck-sub')
  const rows = document.getElementById('ck-accounts')
  const now = document.getElementById('ck-now')

  toggle.checked = ck.enabled === true
  if (ck.at) time.value = ck.at
  const isOn = ck.enabled === true

  sub.textContent = isOn ? `已开，${ck.at}（±3 分钟防风控）` : '关'
  rows.replaceChildren()

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
  now.onclick = async () => {
    now.disabled = true; now.textContent = '已提交…'; sub.textContent = '已提交，宿主重载后开始签到'
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, pendingCheckin: { at: Date.now() } })
      setTimeout(() => location.reload(), 6000)
    } catch {
      now.disabled = false; now.textContent = '立即签到'; sub.textContent = '提交失败（页面没有写权限）'
    }
  }
}

function paintTravel() {
  const tv = V?.travel ?? { enabled: false, everyMin: 30, accounts: [] }
  const toggle = document.getElementById('tv-toggle')
  const every = document.getElementById('tv-every')
  const sub = document.getElementById('tv-sub')
  const rows = document.getElementById('tv-accounts')
  const now = document.getElementById('tv-now')

  toggle.checked = tv.enabled === true
  every.value = String(tv.everyMin || 30)
  sub.textContent = tv.enabled ? `已开，每 ${tv.everyMin} 分钟（±20%）` : '关'
  rows.replaceChildren()

  const save = async (patch) => {
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, ...patch })
      sub.textContent = '已保存，下一次加载生效'
    } catch { sub.textContent = '保存失败（页面无写权限）' }
  }
  toggle.onchange = () => save({ autoTravel: toggle.checked })
  every.onchange = () => {
    const v = Math.max(5, Math.min(720, Number(every.value) || 30))
    every.value = String(v)
    save({ travelEveryMin: v })
  }
  now.onclick = async () => {
    now.disabled = true; now.textContent = '已提交…'; sub.textContent = '已提交，宿主重载后推进一步'
    try {
      const opts = (await magpie.options.get()) || {}
      await magpie.options.set({ ...opts, pendingTravel: { at: Date.now() } })
      setTimeout(() => location.reload(), 6000)
    } catch {
      now.disabled = false; now.textContent = '推进一步'; sub.textContent = '提交失败（页面没有写权限）'
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
  const actions = document.getElementById('tf-actions')
  const toggle = document.getElementById('tf-toggle')
  const bodyEls = [area, status, actions]
  const setOpen = (open) => {
    for (const node of bodyEls) if (node) node.hidden = !open
    if (toggle) { toggle.textContent = open ? '收起' : '展开'; toggle.setAttribute('aria-expanded', String(open)) }
  }
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = '1'
    toggle.addEventListener('click', () => setOpen(toggle.textContent === '展开'))
  }
  setOpen(false)

  status.replaceChildren()
  const lastImport = tf.lastImport
  const lastExport = tf.lastExport
  if (lastImport?.at) {
    const ok = lastImport.ok !== false
    const line = el('span', 'ck-acc')
    let text
    if (!ok) text = '导入失败'
    else if ((lastImport.added ?? 0) === 0 && !lastImport.renamed && !lastImport.dropped) text = `已是最新（${lastImport.imported} 个账号都在）`
    else {
      const bits = [`${lastImport.imported} 个`]
      if (lastImport.added) bits.push(`新增 ${lastImport.added}`)
      if (lastImport.renamed) bits.push(`改名 ${lastImport.renamed}`)
      if (lastImport.dropped) bits.push(`清理 ${lastImport.dropped}`)
      text = `导入 ${bits.join(' · ')}`
    }
    line.append(el('span', `pill ${ok ? 'ok' : 'warn'}`, text))
    line.append(el('span', 'ck-when', md(lastImport.at)))
    if (!ok && lastImport.error) line.append(el('span', 'ck-when', String(lastImport.error).slice(0, 60)))
    status.append(line)
  }
  if (lastExport?.at) {
    const line = el('span', 'ck-acc')
    line.append(el('span', `pill ${lastExport.ok === false ? 'warn' : 'ok'}`, lastExport.ok === false ? '导出失败' : `导出 ${lastExport.count} 个`))
    const fileEl = el('span', 'ck-when mono', lastExport.file || '')
    if (lastExport.file) fileEl.title = lastExport.file
    line.append(fileEl)
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
