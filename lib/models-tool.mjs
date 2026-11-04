// wbkit_models 直连版：不经过本地服务，直接在插件进程里读登录态、打 /v3/config，
// 返回国内/国际模型目录与套餐（只读，不调模型、不花积分）。
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createClient } from './wbclient.mjs'
import { chinaModels, intlModels } from './models.mjs'
import { loadAccounts, readMagpieConfigDir } from './engine/store.mjs'

function cfgDir() {
  return readMagpieConfigDir() || join(homedir(), '.config', 'magpie')
}

function fmt(x) {
  const out = []
  const plan = (v) => (v?.plan ? `${v.plan.name}${v.plan.paid ? '（付费）' : '（免费）'}` : '未知套餐')
  const detail = (label, v) => {
    if (!v) return out.push(`${label}：无账号或读取失败`)
    const models = v.models ?? []
    out.push(`${label} · ${v.account ?? ''} · ${plan(v)} · ${models.length} 个模型`)
    for (const m of models.slice(0, 12)) {
      const bits = [`rate=${m.rate ?? '浮动'}`]
      if (m.context) bits.push(`ctx=${Math.round(m.context / 1000)}k`)
      if (m.tier?.label) bits.push(`档位=${m.tier.label}${m.tier.exclusive ? '(专属)' : ''}`)
      if (m.promo?.label) bits.push(`促销=${m.promo.label}${m.promo.rate != null ? `→${m.promo.rate}` : ''}`)
      out.push(`  · ${m.name} (${m.id})  ${bits.join(' ')}`)
    }
    if (models.length > 12) out.push(`  … 其余 ${models.length - 12} 个略`)
  }
  detail('国内版', x.cn)
  detail('国际版', x.intl)
  for (const [k, v] of Object.entries(x.errors ?? {})) if (v) out.push(`! ${k}: ${v}`)
  return out.join('\n')
}

export function makeModelsTool() {
  return {
    models: {
      description:
        'WorkBuddy 的模型目录与套餐（只读，不调用模型、不花积分）：国内/国际模型、积分倍率、上下文、档位/促销、当前套餐。',
      args: { type: 'object', properties: {}, additionalProperties: false },
      async execute() {
        try {
          const all = loadAccounts(cfgDir())
          const cn = all.find((a) => a.provider === 'workbuddy' && !a.enterpriseId && a.access)
          const intl = all.find((a) => a.provider === 'workbuddy-ai' && a.access)
          if (!cn && !intl) return { output: '没有已登录的 WorkBuddy 账号（先在供应商页登录）。' }
          const authOf = (a) => ({ access: a.access, uid: a.uid, domain: a.domain, enterpriseId: a.enterpriseId, expires: a.expires })
          const out = { cn: null, intl: null, errors: {} }
          if (cn) {
            try { out.cn = await chinaModels(createClient({ name: cn.nickname, auth: authOf(cn) })) }
            catch (e) { out.errors.cn = String(e?.message ?? e).slice(0, 200) }
          }
          if (intl) {
            try { out.intl = await intlModels({ name: intl.nickname, auth: authOf(intl) }) }
            catch (e) { out.errors.intl = String(e?.message ?? e).slice(0, 200) }
          }
          return { output: fmt(out) }
        } catch (e) {
          return { output: `读取失败：${String(e?.message ?? e).slice(0, 200)}` }
        }
      },
    },
  }
}
