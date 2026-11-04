// 面板只读区块（0.4.0）：后台排程、今日统计、提醒、最近执行历史。
// 数据来自插件加载时写的 page/data.js（globalThis.WBKIT 的 scheduler/stats/reminders/history）。
// 沙盒页无网络，这里只负责渲染，不发任何请求。
;(function () {
  if (typeof document === 'undefined') return
  const V = globalThis.WBKIT
  if (!V || !V.totals) return
  const ov = document.getElementById('overview')
  if (!ov) return

  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const card = (title, html, sub) =>
    `<div style="flex:1 1 220px;min-width:200px;border:1px solid #e6eeeb;border-radius:14px;padding:12px 14px;background:#fff">
      <div style="font-size:12px;color:#6b8a81;font-weight:600">${esc(title)}</div>
      <div style="margin-top:6px;font-size:13px;color:#123f35;line-height:1.6">${html}</div>
      ${sub ? `<div style="margin-top:4px;font-size:11px;color:#8aa39b">${esc(sub)}</div>` : ''}
    </div>`

  const st = V.stats || {}
  const rm = V.reminders || []
  const h = V.history || []

  const today = card(
    '今日',
    `<b style="font-size:18px;color:#0f9c78">+${esc(st.creditsToday ?? 0)}</b> 积分
     <span style="color:#6b8a81">· ${esc(st.energyToday ?? 0)} 能量 · ${esc(st.runs ?? 0)} 轮</span>`,
    '来自本地任务历史（北京时间）',
  )
  const reminders = card(
    '提醒',
    rm.length
      ? `<ul style="margin:0;padding-left:16px">${rm.map((r) => `<li>${esc(r.account)}：${esc(r.text)}</li>`).join('')}</ul>`
      : '<span style="color:#8aa39b">暂无</span>',
    rm.length ? '' : '积分/登录快过期时会列在这里',
  )

  const wrap = document.createElement('section')
  wrap.className = 'panel-readonly'
  wrap.style.cssText = 'display:flex;gap:12px;flex-wrap:wrap;margin:12px 0 4px'
  wrap.innerHTML = today + reminders
  document.body.appendChild(wrap)

  // 成长任务每日自动：面板可直接开关/改时间（写 options，宿主重载后生效）
  const auto = V.panel || {}
  const autoEl = document.createElement('div')
  autoEl.style.cssText = 'flex:1 1 220px;min-width:200px;border:1px solid #e6eeeb;border-radius:14px;padding:12px 14px;background:#fff'
  autoEl.innerHTML = `<div style="font-size:12px;color:#6b8a81;font-weight:600">成长任务每日自动</div>
    <div style="margin-top:8px;font-size:13px;color:#123f35;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
      <label style="display:flex;align-items:center;gap:6px"><input type="checkbox" data-a-auto ${auto.autoTasks ? 'checked' : ''}/> 开启</label>
      <span>每天</span><input type="time" data-a-at value="${String(auto.taskAt || '09:10')}" style="border:1px solid #cfe0db;border-radius:8px;padding:3px 8px"/>
      <span style="color:#8aa39b">北京时间</span>
    </div>
    <div style="margin-top:4px;font-size:11px;color:#8aa39b">到点自动对所有国内个人账号跑一轮成长任务（一天一次）</div>`
  wrap.appendChild(autoEl)
  const autoCb = autoEl.querySelector('[data-a-auto]')
  const autoAt = autoEl.querySelector('[data-a-at]')
  let saving = false
  const saveAuto = async () => {
    if (saving) return
    saving = true
    try {
      if (mp?.options?.get && mp?.options?.set) {
        const cur = (await mp.options.get()) || {}
        await mp.options.set({ ...cur, autoTasks: !!autoCb.checked, taskAt: autoAt.value || '09:10' })
      }
    } catch {}
    saving = false
  }
  autoCb?.addEventListener('change', saveAuto)
  autoAt?.addEventListener('change', saveAuto)

  // 任务进度（快照里带了 taskStats/tasks 才显示）
  const withTasks = (V.accounts || []).filter((a) => a.taskStats && a.taskStats.total > 0)
  if (withTasks.length) {
    const rows = withTasks.map((a) => {
      const st = a.taskStats
      const open = (a.tasks || [])
        .filter((t) => !(t.target > 0 && t.current >= t.target) && !t.manual)
        .slice(0, 4)
        .map((t) => `${esc(t.title)}（${esc(t.current)}/${esc(t.target)}${t.reward ? `，+${esc(t.reward)}` : ''}）`)
        .join('；')
      return `<tr>
        <td style="padding:5px 8px;white-space:nowrap">${esc(a.label)}</td>
        <td style="padding:5px 8px;color:#0f9c78">${esc(st.done)}/${esc(st.total)}</td>
        <td style="padding:5px 8px;color:#8a7b3a">${esc(st.active)}</td>
        <td style="padding:5px 8px;color:#8a7b3a">${esc(st.notAccepted)}</td>
        <td style="padding:5px 8px;color:#5b7a72">${open || (a.tasksError ? esc(a.tasksError) : '—')}</td>
      </tr>`
    }).join('')
    const sec = document.createElement('section')
    sec.style.cssText = 'margin:18px 0 4px'
    sec.innerHTML = `<h2 style="font-size:14px;color:#123f35;margin:0 0 6px">任务进度</h2>
      <div style="overflow:auto;border:1px solid #e6eeeb;border-radius:12px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f3fbf8;color:#6b8a81;text-align:left">
          <th style="padding:6px 8px">账号</th><th style="padding:6px 8px">已完成</th>
          <th style="padding:6px 8px">进行中</th><th style="padding:6px 8px">待接取</th><th style="padding:6px 8px">未完成</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
    wrap.insertAdjacentElement('afterend', sec)
  }

  // 最近执行历史：放在页面最后（footer 之前），没有就不占地方
  if (h.length) {
    const sec = document.createElement('section')
    sec.style.cssText = 'margin:18px 0 4px'
    const rows = h
      .slice(0, 12)
      .map((r) => {
        const t = r.at ? new Date(r.at).toLocaleString('zh-CN', { hour12: false }) : ''
        const tone = r.state === 'ok' ? '#0f9c78' : r.state === 'fail' ? '#c0503a' : '#8a7b3a'
        return `<tr>
          <td style="padding:5px 8px;color:#8aa39b;white-space:nowrap">${esc(t)}</td>
          <td style="padding:5px 8px">${esc(r.nickname || '')}</td>
          <td style="padding:5px 8px">${esc(r.leg || '')}</td>
          <td style="padding:5px 8px;color:${tone}">${esc(r.state || '')}</td>
          <td style="padding:5px 8px;color:#5b7a72">${esc(r.detail || '')}</td>
          <td style="padding:5px 8px;color:#0f9c78">${r.credit ? '+' + esc(r.credit) : ''}</td>
        </tr>`
      })
      .join('')
    sec.innerHTML = `<h2 style="font-size:14px;color:#123f35;margin:0 0 6px">最近执行</h2>
      <div style="overflow:auto;border:1px solid #e6eeeb;border-radius:12px">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:#f3fbf8;color:#6b8a81;text-align:left">
          <th style="padding:6px 8px">时间</th><th style="padding:6px 8px">账号</th><th style="padding:6px 8px">任务</th>
          <th style="padding:6px 8px">结果</th><th style="padding:6px 8px">说明</th><th style="padding:6px 8px">积分</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
    document.body.appendChild(sec)
  }
})()
