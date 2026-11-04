// 面板只读区块（0.5.0）：成长任务自动面板（顶部）+ 任务进度表（中部）。
// 数据来自插件加载时写的 page/data.js（globalThis.WBKIT）。
// 沙盒页无网络，这里只负责渲染，不发任何请求。
;(function () {
  if (typeof document === 'undefined') return
  const V = globalThis.WBKIT
  if (!V || !V.totals) return
  const ov = document.getElementById('overview')
  if (!ov) return

  const mp = globalThis.magpie
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

  // ---- 成长任务每日自动（紧贴概览区下方）-----
  const auto = V.panel || {}
  const autoEl = document.createElement('div')
  autoEl.style.cssText = 'margin-top:16px;padding:12px 16px;border:1px solid var(--line);border-radius:var(--radius);display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13px;color:var(--fg)'
  autoEl.innerHTML = `
    <span style="font-weight:600;font-size:13px">成长任务每日自动</span>
    <label style="display:flex;align-items:center;gap:6px">
      <input type="checkbox" data-a-auto ${auto.autoTasks ? 'checked' : ''}/>
      开启
    </label>
    <span>每天</span>
    <input type="time" data-a-at value="${String(auto.taskAt || '09:10')}" style="font:inherit;font-size:12px;color:var(--fg);background:var(--bg);border:1px solid var(--line);border-radius:8px;padding:3px 7px"/>
    <span style="color:var(--muted);font-size:12px">到点自动跑一轮（北京）</span>`
  ov.insertAdjacentElement('afterend', autoEl)

  const autoCb = autoEl.querySelector('[data-a-auto]')
  const autoAt = autoEl.querySelector('[data-a-at]')
  let saving = false
  const saveAuto = async () => {
    if (saving) return; saving = true
    try {
      if (mp?.options?.get && mp?.options?.set) {
        const cur = (await mp.options.get()) || {}
        await mp.options.set({ ...cur, autoTasks: !!autoCb.checked, taskAt: autoAt.value || '09:10' })
      }
    } catch {} finally { saving = false }
  }
  autoCb?.addEventListener('change', saveAuto)
  autoAt?.addEventListener('change', saveAuto)

  // ---- 任务进度表（概览区与账号列表之间）-----
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
    const sec = document.createElement('section')
    sec.style.cssText = 'margin:18px 0 6px'
    sec.innerHTML = `<h2 style="font-size:14px;color:var(--fg);margin:0 0 6px">任务进度</h2>
      <div style="overflow:auto;border:1px solid var(--line);border-radius:var(--radius)">
      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead><tr style="background:var(--surface-2);color:var(--muted);text-align:left">
          <th style="padding:6px 8px">账号</th><th style="padding:6px 8px">已完成</th>
          <th style="padding:6px 8px">进行中</th><th style="padding:6px 8px">待接取</th><th style="padding:6px 8px">未完成</th>
        </tr></thead><tbody>${rows}</tbody></table></div>`
    autoEl.insertAdjacentElement('afterend', sec)
  }
})()