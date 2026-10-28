// auth.checkin：magpie 每个北京日为每个账号调一次（用户为该供应商开着签到时）。
// 返回 { outcome, credit?, streak?, message? }，outcome 只能是 magpie 认的那六个。
import { callAny, saidOf } from './api.mjs'

const OUTCOMES = new Set(['claimed', 'done', 'ineligible', 'inactive', 'captcha', 'failed'])

function pick(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim()
  }
  return ''
}

// classify 把官方回答翻译成 magpie 的 outcome。
export function classify(res) {
  const json = res?.json
  const said = pick(json?.msg, json?.message, json?.error_msg, '')
  const data = json?.data ?? json?.Response?.Data ?? null
  const credit = Number(data?.credit ?? data?.points ?? data?.creditAmount ?? 0) || 0
  const streak = Number(data?.streakDays ?? data?.streak ?? data?.continuityDays ?? 0) || 0
  const base = { credit, ...(streak ? { streak } : {}) }

  const code = json?.code
  if (res?.status === 200 && (code === 0 || code === '0')) {
    return { outcome: 'claimed', ...base, message: said || `签到成功${credit ? `（+${credit}）` : ''}` }
  }
  // 顺序有讲究：验证码和无活动要先于「已签到」判断，否则 400 会被一律当成 done。
  if (/验证码|captcha/i.test(said)) return { outcome: 'captcha', message: said }
  if (/已签到|已领取|already/i.test(said)) return { outcome: 'done', message: said }
  if (/未开通|无[^，。]{0,4}活动|活动未(开始|上线)|not\s*eligible|ineligible/i.test(said)) return { outcome: 'ineligible', message: said }
  return { outcome: 'failed', message: said || saidOf(res) }
}

export async function checkinFor(provider, getAuth, options = {}) {
  if (options.takeOverCheckin === false) return { outcome: 'inactive', message: '签到交给外部工具（options.takeOverCheckin=false）' }
  const auth = await getAuth()
  if (provider !== 'workbuddy') return { outcome: 'inactive', message: '国际版没有国内签到活动' }
  if (!auth?.access) return { outcome: 'inactive', message: '没有有效令牌' }
  if (auth.enterpriseId) return { outcome: 'ineligible', message: '企业账号没有个人签到' }

  let res
  try {
    res = await callAny(auth, provider, 'checkin', {}, 20000)
  } catch (e) {
    return { outcome: 'failed', message: String(e?.message ?? e).slice(0, 200) }
  }
  if (res.status === 401 || res.status === 403) {
    return { outcome: 'failed', message: '登录被拒绝，请重新登录' }
  }
  const result = classify(res)
  return OUTCOMES.has(result.outcome) ? result : { outcome: 'failed', message: saidOf(res) }
}
