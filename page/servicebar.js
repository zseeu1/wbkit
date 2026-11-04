// 任务/模型看板的入口条（0.4.0）。账号页仍由 app.js 渲染；这里补一块「后台服务」
// 控制：默认懒启动，点「打开看板」时才拉起服务并跳到服务页（magpie.page.service
// 反代的 _magpie/service，或退回 127.0.0.1:<port>）。沙盒外（测试）静默跳过。
;(async () => {
  if (typeof document === 'undefined') return
  const mp = globalThis.magpie
  let opts = {}
  try {
    if (mp?.ready) await mp.ready
    if (mp?.options?.get) opts = (await mp.options.get()) || {}
  } catch {
    /* 沙盒外 */
  }

  const mode = String(opts.service ?? 'lazy')
  const port = Number(opts.servicePort) > 0 ? Number(opts.servicePort) : 4390
  const withSlash = (u) => (/\/$/.test(u) ? u : u + '/')
  const dashboard = withSlash(
    (typeof mp?.service === 'string' && mp.service) ||
      String(opts.dashboardUrl || '') ||
      `http://127.0.0.1:${port}/`,
  )

  const host = document.querySelector('header.top') || document.body.firstElementChild
  if (!host) return

  const bar = document.createElement('section')
  bar.className = 'service-bar'
  bar.style.cssText =
    'margin:14px 0 4px;padding:14px 16px;border:1px solid #d7e9e4;border-radius:14px;background:#f3fbf8;display:flex;flex-wrap:wrap;gap:12px;align-items:center;justify-content:space-between'
  bar.innerHTML = `
    <div style="min-width:220px">
      <div style="font-weight:600;color:#0f3d33">任务 / 模型看板</div>
      <div style="font-size:12px;color:#5b7a72;margin-top:2px">
        批量成长任务、猫猫旅行、夜猫子、模型目录与套餐。后台服务当前：<b data-mode></b>
      </div>
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      <button data-open style="border:0;border-radius:9px;background:#0f9c78;color:#fff;padding:8px 14px;font-size:13px;cursor:pointer">打开看板</button>
      <button data-on style="border:1px solid #b9d8cf;border-radius:9px;background:#fff;color:#0f3d33;padding:8px 12px;font-size:13px;cursor:pointer">常驻开启</button>
      <button data-off style="border:1px solid #e0d4c0;border-radius:9px;background:#fff;color:#7a5b2c;padding:8px 12px;font-size:13px;cursor:pointer">停止服务</button>
    </div>`
  host.insertAdjacentElement('afterend', bar)
  const modeEl = bar.querySelector('[data-mode]')
  const label = { lazy: '懒启动（用时才起）', on: '常驻', off: '已停用' }
  if (modeEl) modeEl.textContent = label[mode] || mode

  const setMode = async (value) => {
    try {
      await mp?.options?.set?.({ ...opts, service: value })
      if (modeEl) modeEl.textContent = (label[value] || value) + '（已保存，插件重载后生效）'
    } catch (e) {
      if (modeEl) modeEl.textContent = '保存失败：' + (e?.message ?? e)
    }
  }
  bar.querySelector('[data-open]')?.addEventListener('click', () => {
    try {
      window.open(dashboard, '_blank', 'noopener')
    } catch {
      /* 沙盒页禁止弹窗时，给出地址 */
    }
  })
  bar.querySelector('[data-on]')?.addEventListener('click', () => setMode('on'))
  bar.querySelector('[data-off]')?.addEventListener('click', () => setMode('off'))
})()
