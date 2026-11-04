// 面板只读区块（0.5.0）：成长任务自动面板 + 任务进度表（猫猫旅行下方）。
// 数据来自插件加载时写的 page/data.js（globalThis.WBKIT）。
// 沙盒页无网络，这里只负责渲染，不发任何请求。
;(function () {
  if (typeof document === 'undefined') return
  const V = globalThis.WBKIT
  if (!V || !V.totals) return
  const travelPanel = document.getElementById('travel')
  if (!travelPanel) return

  const mp = globalThis.magpie
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e }

  // ---- 成长任务每日自动（与签到/旅行统一的 control 面板）-----
  const auto = V.panel || {}
  const autoPanel = el('section', 'control')
  autoPanel.innerHTML = `
    <div class="ctl-left">
      <span class="ctl-title">成长任务</span>
      <span class="ctl-sub">${auto.autoTasks ? `已开，每天 ${auto.taskAt || '09:10'}（±5 分钟防风控）` : '关（打开后到点自动对所有账号跑一轮成长任务）'}</span>
    </div>
    <div class="ctl-right ctl-row">
      <label class="time">
        <input type="time" data-a-at value="${String(auto.taskAt || '09:10')}"/>
        <span>±5 分</span>
      </label>
      <label class="switch">
        <input type="checkbox" data-a-auto ${auto.autoTasks ? 'checked' : ''}/>
        <span class="track"><span class="knob"></span></span>
      </label>
    </div>`
  travelPanel.insertAdjacentElement('afterend', autoPanel)

  const autoCb = autoPanel.querySelector('[data-a-auto]')
  const autoAt = autoPanel.querySelector('[data-a-at]')
  const autoSub = autoPanel.querySelector('.ctl-sub')
  let saving = false
  const saveAuto = async () => {
    if (saving) return; saving = true
    try {
      if (mp?.options?.get && mp?.options?.set) {
        const cur = (await mp.options.get()) || {}
        await mp.options.set({ ...cur, autoTasks: !!autoCb.checked, taskAt: autoAt.value || '09:10' })
        if (autoSub) autoSub.textContent = autoCb.checked ? `已开，每天 ${autoAt.value || '09:10'}（±5 分钟防风控）` : '关（打开后到点自动对所有账号跑一轮成长任务）'
      }
    } catch {} finally { saving = false }
  }
  autoCb?.addEventListener('change', saveAuto)
  autoAt?.addEventListener('change', saveAuto)

  // ---- 任务进度表（成长任务面板下方）-----
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
        <td style="padding:5px 8px;color:var(--green)">${esc(st.done)}/${esc(st.total)}</td>
        <td style="padding:5px 8px;color:var(--orange)">${esc(st.active)}</td>
        <td style="padding:5px 8px;color:var(--orange)">${esc(st.notAccepted)}</td>
        <td style="padding:5px 8px;color:var(--muted)">${open || (a.tasksError ? esc(a.tasksError) : '—')}</td>
      </tr>`
    }).join('')
    const sec = el('section')
    sec.style.cssText = 'margin:18px 0 6px'
    sec.innerHTML = `<h2 style="font-size:14px;color:var(--fg);margin:0 0 6px">任务进度</h2>
      <div style="overflow:auto;border:1px solid var(--line);border-radius:var(--radius)">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--surface-2);color:var(--muted);text-align:left">
          <th style="padding:6px 8px">账号</th><th style="padding:6px 8px">已完成</th>
          <th style="padding:6px 8px">进行中</th><th style="padding:6px 8px">待接取</th><th style="padding:6px 8px">未完成</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
    autoPanel.insertAdjacentElement('afterend', sec)
  }
})()