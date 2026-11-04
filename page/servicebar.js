// 面板顶部条（0.5.0）：只有「刷新」，没有后台服务了。
// 面板数据是插件加载时写的一份快照；点刷新 = 改一次 options（refreshAt）→ 宿主重载插件
// → 重新生成 page/data.js → 稍后整页重载拿新快照。沙盒页自己连不了网，只能这么刷。
;(async () => {
  if (typeof document === 'undefined') return
  const mp = globalThis.magpie
  let opts = {}
  try {
    if (mp?.ready) await mp.ready
    if (mp?.options?.get) opts = (await mp.options.get()) || {}
  } catch {}

  const V = globalThis.WBKIT || {}
  const generated = V.generatedAt ? new Date(V.generatedAt).toLocaleString('zh-CN', { hour12: false }) : '—'

  const host = document.querySelector('header.top') || document.body.firstElementChild
  if (!host) return

  const bar = document.createElement('section')
  bar.style.cssText =
    'margin:10px 0 4px;padding:10px 14px;border:1px solid #d7e9e4;border-radius:12px;background:#f3fbf8;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between'
  bar.innerHTML = `
    <div style="font-size:12px;color:#5b7a72">快照时间：<b data-gen style="color:#0f3d33">${escapeHtml(generated)}</b>
      <span style="margin-left:8px;color:#8aa39b">页面只读快照，点刷新重新生成</span></div>
    <button data-refresh style="border:0;border-radius:9px;background:#0f9c78;color:#fff;padding:7px 14px;font-size:13px;cursor:pointer">刷新</button>`
  host.insertAdjacentElement('afterend', bar)
  const genEl = bar.querySelector('[data-gen]')

  bar.querySelector('[data-refresh]')?.addEventListener('click', async () => {
    try {
      if (genEl) genEl.textContent = '刷新中…（重载插件并重生成快照）'
      if (mp?.options?.set) {
        const cur = (await mp.options.get?.()) || opts || {}
        await mp.options.set({ ...cur, refreshAt: Date.now() })
        setTimeout(() => { try { location.reload() } catch {} }, 2500)
      } else {
        try { location.reload() } catch {}
      }
    } catch (e) {
      if (genEl) genEl.textContent = '刷新失败：' + (e?.message ?? e)
    }
  })

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  }
})()
