// 两个经本地服务执行的工具：wbkit_tasks（批量任务）与 wbkit_models（模型目录/套餐）。
// 它们不直接打上游，而是让本地服务（service/server.mjs）执行——长活（批量任务）在
// 服务里跑，工具只负责启动/轮询，单次调用 ≤55s。服务由调用方通过 ensure() 懒启动。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function call(info, method, path, body, timeoutMs = 52000) {
  const res = await fetch(`http://127.0.0.1:${info.port}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${info.key ?? ''}`,
      'x-wbkit': '1',
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  let data = null
  try {
    data = await res.json()
  } catch {}
  return { status: res.status, ok: res.ok, data }
}

const short = (e) => String(e?.message ?? e).slice(0, 200)

function fmtState(s) {
  const lines = []
  const accts = s.accounts ?? []
  const on = accts.filter((a) => a.tasksEnabled)
  lines.push(`账号：${accts.length} 个已登录，${on.length} 个参与任务`)
  for (const a of accts.slice(0, 10)) {
    const days = a.expiresInDays == null ? '有效期未知' : `令牌剩 ${a.expiresInDays} 天`
    lines.push(`  · ${a.nickname || a.uid}（${a.tasksEnabled ? '参与' : '已停用'}，${days}）`)
  }
  if (accts.length > 10) lines.push(`  … 其余 ${accts.length - 10} 个略`)
  const sc = s.scheduler ?? {}
  const next = (sc.nextRuns ?? []).map(([leg, h]) => `${leg}@${String(h).padStart(2, '0')}:00`).join('、')
  lines.push(`排程：${sc.enabled ? '开启' : '关闭'}${next ? `，窗口：${next}` : ''}`)
  const j = s.job
  if (j) {
    const done = (j.steps ?? []).filter((x) => x.state === 'ok' || x.state === 'skip' || x.state === 'fail').length
    lines.push(`当前任务：job ${j.id}（${j.state}，${done}/${(j.steps ?? []).length} 步）`)
  } else lines.push('当前任务：无')
  const st = s.stats ?? {}
  lines.push(`今日：${st.creditsToday ?? 0} 积分 · ${st.energyToday ?? 0} 能量 · ${st.runs ?? 0} 轮`)
  if (s.engineErrors?.length) lines.push(`引擎告警：${s.engineErrors.join('；')}`)
  return lines.join('\n')
}

function fmtModels(m) {
  const out = []
  const plan = (x) => (x?.plan ? `${x.plan.name}${x.plan.paid ? '（付费）' : '（免费）'}` : '未知套餐')
  const detail = (label, x) => {
    if (!x) return `${label}：无账号或读取失败`
    const models = x.models ?? []
    out.push(`${label} · ${x.account ?? ''} · ${plan(x)} · ${models.length} 个模型`)
    for (const mm of models.slice(0, 12)) {
      const bits = [`rate=${mm.rate ?? '浮动'}`]
      if (mm.context) bits.push(`ctx=${Math.round(mm.context / 1000)}k`)
      if (mm.tier?.label) bits.push(`档位=${mm.tier.label}${mm.tier.exclusive ? '(专属)' : ''}`)
      if (mm.promo?.label) bits.push(`促销=${mm.promo.label}${mm.promo.rate != null ? `→${mm.promo.rate}` : ''}`)
      out.push(`  · ${mm.name} (${mm.id})  ${bits.join(' ')}`)
    }
    if (models.length > 12) out.push(`  … 其余 ${models.length - 12} 个略`)
  }
  detail('国内版', m.cn)
  detail('国际版', m.intl)
  const errs = Object.entries(m.errors ?? {}).filter(([, v]) => v)
  for (const [k, v] of errs) out.push(`! ${k}: ${v}`)
  return out.join('\n')
}

export function makeServiceTools({ ensure, log = () => {} } = {}) {
  const withService = async () => {
    const r = await ensure()
    const info = r?.info
    if (!info?.port) throw new Error(r?.error || '本地服务未能启动（详情见 magpie 日志 [wbkit] 行）')
    return info
  }

  return {
    tasks: {
      description:
        'WorkBuddy 国内版成长任务的批量自动化（任务流水线：接取→点亮→轮询进度→达标领奖，含猫猫旅行与夜猫子；带风控冷却）。动作：status=看账号/排程/当前任务；run=启动一轮并返回 job id；wait=轮询 job 直到完成；list=看某账号任务表；claim=领单任务奖励。仅国内版个人账号。',
      args: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['status', 'run', 'wait', 'list', 'claim'] },
          uids: { type: 'array', items: { type: 'string' }, description: 'run 指定账号 uid（默认全部参与账号）' },
          legs: { type: 'array', items: { type: 'string', enum: ['growth', 'travel', 'night'] }, description: 'run 的腿，默认全部' },
          claim: { type: 'boolean', description: 'run 是否领奖，默认 true' },
          codes: { type: 'array', items: { type: 'string' }, description: 'run 只做选中任务 code（默认全部）' },
          jobId: { type: 'string', description: 'wait 的 job id' },
          uid: { type: 'string', description: 'list/claim 的账号 uid' },
          code: { type: 'string', description: 'claim 的任务 code' },
        },
        required: ['action'],
      },
      async execute(args = {}) {
        const info = await withService()
        const a = args.action || 'status'
        try {
          if (a === 'status') {
            const r = await call(info, 'GET', '/api/state')
            return { output: r.ok ? fmtState(r.data) : `读取失败 HTTP ${r.status}：${r.data?.error ?? ''}` }
          }
          if (a === 'run') {
            const body = { uids: args.uids, legs: args.legs, claim: args.claim !== false, codes: args.codes }
            const r = await call(info, 'POST', '/api/run', body)
            if (!r.ok) return { output: `启动失败 HTTP ${r.status}：${r.data?.error ?? ''}` }
            return { output: `已启动 job ${r.data?.job?.id}，用 status 或 wait 查看进度。` }
          }
          if (a === 'wait') {
            if (!args.jobId) return { output: '需要 jobId' }
            const deadline = Date.now() + 50000
            while (Date.now() < deadline) {
              const r = await call(info, 'GET', `/api/jobs/${encodeURIComponent(args.jobId)}`)
              const j = r.data?.job
              if (!j) return { output: `找不到 job ${args.jobId}` }
              if (j.state === 'done' || j.state === 'error') {
                const steps = (j.steps ?? []).map((s) => `  · ${s.leg}/${s.account ?? ''} ${s.state} ${s.credit ? `+${s.credit}` : ''} ${s.detail ?? ''}`).join('\n')
                return { output: `job ${j.id} ${j.state}${j.error ? `：${j.error}` : ''}\n${steps}` }
              }
              await sleep(2500)
            }
            return { output: `job ${args.jobId} 仍在运行，稍后再 wait。` }
          }
          if (a === 'list') {
            const r = await call(info, 'GET', '/api/state')
            if (!r.ok) return { output: `读取失败 HTTP ${r.status}` }
            const acct = (r.data?.accounts ?? []).find((x) => !args.uid || String(x.uid).startsWith(args.uid))
            if (!acct) return { output: '没有匹配的账号' }
            const tasks = acct.tasks ?? []
            if (!tasks.length) return { output: `${acct.nickname || acct.uid} 暂无可读任务快照（先刷新/跑一轮）` }
            return { output: `${acct.nickname || acct.uid}\n` + tasks.map((t) => `  · ${t.code} ${t.title ?? ''} [${t.acceptStatus ?? ''}/${t.taskType ?? ''}]`).join('\n') }
          }
          if (a === 'claim') {
            if (!args.uid || !args.code) return { output: '需要 uid 与 code' }
            const r = await call(info, 'POST', '/api/task/claim', { uid: args.uid, code: args.code })
            return { output: r.ok ? `领取结果：${JSON.stringify(r.data)}` : `领取失败 HTTP ${r.status}：${r.data?.error ?? ''}` }
          }
          return { output: `未知 action：${a}` }
        } catch (e) {
          return { output: `执行失败：${short(e)}` }
        }
      },
    },

    models: {
      description:
        'WorkBuddy 的模型目录与套餐（只读，不调用模型、不花积分）：国内/国际模型、积分倍率、上下文、档位/促销、当前套餐。',
      args: { type: 'object', properties: {}, additionalProperties: false },
      async execute() {
        const info = await withService()
        try {
          const r = await call(info, 'GET', '/api/models', undefined, 40000)
          if (!r.ok) return { output: `读取失败 HTTP ${r.status}：${r.data?.error ?? ''}` }
          return { output: fmtModels(r.data) }
        } catch (e) {
          return { output: `执行失败：${short(e)}` }
        }
      },
    },
  }
}
