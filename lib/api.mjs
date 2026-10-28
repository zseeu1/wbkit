// WorkBuddy 的 billing 接口。三件事各走不同的路径，都实测过：
//   余额/到期  POST {chat 域}/v2/billing/meter/get-user-resource      （body 传 {}）
//   请求用量   POST {web 域}/billing/meter/get-user-request-usage     （无 /v2 前缀）
//   每日签到   POST {chat 域}/v2/billing/meter/daily-checkin
// 请求头照抄 WorkBuddy 桌面客户端，否则 copilot.tencent.com 会以 10085 拒绝。
const UA = 'WorkBuddy/5.5.6'

const BUILDS = {
  workbuddy: {
    label: 'WorkBuddy',
    resource: [
      'https://copilot.tencent.com/v2/billing/meter/get-user-resource',
      'https://www.workbuddy.cn/billing/meter/get-user-resource',
    ],
    usage: ['https://www.workbuddy.cn/billing/meter/get-user-request-usage'],
    checkin: ['https://copilot.tencent.com/v2/billing/meter/daily-checkin'],
  },
  'workbuddy-ai': {
    label: 'WorkBuddy AI',
    resource: ['https://www.workbuddy.ai/billing/meter/get-user-resource'],
    usage: ['https://www.workbuddy.ai/billing/meter/get-user-request-usage'],
    checkin: [],
  },
}

export function buildOf(provider) {
  return BUILDS[provider] ?? BUILDS.workbuddy
}

export function headersFor(auth, provider) {
  const h = {
    Authorization: `Bearer ${auth?.access ?? ''}`,
    'User-Agent': UA,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'X-Product': 'SaaS',
    'X-IDE-Type': 'WorkBuddy',
    'X-IDE-Name': 'WorkBuddy',
  }
  if (auth?.uid) h['X-User-Id'] = String(auth.uid)
  const domain = auth?.domain || (provider === 'workbuddy-ai' ? 'www.workbuddy.ai' : 'www.codebuddy.cn')
  if (domain) h['X-Domain'] = domain
  if (auth?.enterpriseId) {
    h['X-Enterprise-Id'] = auth.enterpriseId
    h['X-Tenant-Id'] = auth.enterpriseId
  }
  return h
}

// call 发一次请求，把 body 当作 JSON 文本读回来（这些接口永远回 JSON）。
export async function call(auth, provider, url, body, timeoutMs = 15000) {
  const res = await fetch(url, {
    method: 'POST',
    headers: headersFor(auth, provider),
    body: JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: res.status, json, text }
}

// callAny 按候选顺序试，返回第一个 code===0 的回答；401/403 直接停下交给调用方标记账号。
export async function callAny(auth, provider, kind, body, timeoutMs) {
  const urls = buildOf(provider)[kind] ?? []
  let last = { status: 0, json: undefined, text: 'no endpoint' }
  for (const url of urls) {
    try {
      last = await call(auth, provider, url, body, timeoutMs)
    } catch (e) {
      last = { status: 0, json: undefined, text: e.message, thrown: true }
      continue
    }
    if (last.status === 401 || last.status === 403) return last
    if (last.status === 200 && (last.json?.code === 0 || last.json?.code === '0')) return last
  }
  return last
}

export function saidOf(res) {
  return (
    res?.json?.msg ||
    res?.json?.message ||
    res?.json?.error_msg ||
    (res?.text ? String(res.text).slice(0, 160) : '') ||
    `HTTP ${res?.status ?? 0}`
  )
}
