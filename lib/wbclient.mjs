// WorkBuddy 桌面客户端的请求机制：鉴权头、节流、429/5xx 退避重试。
//
// 这里只做纯 HTTP，不碰 token 存储：模型目录是只读视图，登录续期由调用方
// （Magpie）负责。sabercomo 原版 client.mjs 会把刷新后的 token 写回磁盘，
// 那段行为在这里整个丢掉。
import { setTimeout as delay } from 'node:timers/promises'

export const origin = 'https://www.workbuddy.cn'

export class UpstreamError extends Error {
  constructor(path, status, payload = {}) {
    super(`${path}: HTTP ${status}，${payload.msg || payload.message || `code=${payload.code}`}`)
    this.code = payload.code
    this.status = status
  }
}

// 上游把请求挡在门外、没有真正执行，所以过一会可以安全重发。
export class RateLimited extends UpstreamError {
  constructor(path, payload = {}) {
    super(path, 429, payload)
    this.message = `${path}: 上游限流（HTTP 429），稍后会自动重试`
    this.limited = true
  }
}

// Retry-After 可能是秒数或 HTTP 日期；没有的话按 5s、20s 退避。
export function backoff(response, attempt) {
  const header = response.headers.get('retry-after')
  const seconds = header == null ? NaN : /^\d+$/.test(header.trim()) ? Number(header) : (Date.parse(header) - Date.now()) / 1000
  return Math.min(60_000, Math.max(1000, Number.isFinite(seconds) ? seconds * 1000 : [5000, 20_000][attempt] ?? 20_000))
}

export function createClient(account, config = {}) {
  const fetcher = config.fetcher ?? fetch
  const gap = config.gap ?? 1000
  const proxy = config.proxy ?? ''
  const signal = config.signal
  const wait = config.wait ?? delay
  let lastRequest = 0

  // WorkBuddy 桌面客户端的原样请求头，缺了会被回 10085。
  function headers() {
    const a = account.auth
    const headers = {
      Authorization: `Bearer ${a.access}`,
      'X-User-Id': a.uid,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/plain, */*',
      Origin: origin,
      Referer: `${origin}/profile/growth-center`,
    }
    Object.assign(headers, {
      'X-Domain': a.domain || new URL(origin).host,
      'X-Product': 'SaaS',
      'X-IDE-Type': 'WorkBuddy',
      'X-IDE-Name': 'WorkBuddy',
      'X-IDE-Version': '5.9.3',
      'X-Requested-With': 'XMLHttpRequest',
      'X-Agent-Intent': 'craft',
      'X-Agent-Purpose': 'conversation',
      'User-Agent': 'WorkBuddy/5.9.3 WorkBuddy/5.9.3 CLI/2.165.0',
      ...(a.enterpriseId
        ? { 'X-Enterprise-Id': a.enterpriseId, 'X-Tenant-Id': a.enterpriseId }
        : { 'X-No-Enterprise-Id': '1' }),
    })
    return headers
  }

  async function send(url, init = {}) {
    if (proxy && !globalThis.Bun && fetcher === globalThis.fetch) throw new Error('HTTP 代理需要使用 Bun 启动 WorkBuddy Plus')
    const ms = gap - (Date.now() - lastRequest)
    if (ms > 0) await wait(ms, undefined, { signal })
    lastRequest = Date.now()
    const sig = signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000)
    return fetcher(url, { ...init, signal: sig, ...(proxy ? { proxy } : {}) })
  }

  async function request(path, { base = origin, body, method } = {}) {
    let response
    for (let attempt = 0; ; attempt++) {
      response = await send(base + path, {
        method: method ?? (body === undefined ? 'GET' : 'POST'),
        headers: headers(),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const retryable = response.status === 429 || response.status >= 500
      if (!retryable) break
      if (attempt === 2) {
        if (response.status === 429) {
          let payload = {}
          try { payload = JSON.parse(await response.text()) } catch { /* 非 JSON 就按空对象 */ }
          throw new RateLimited(path, payload)
        }
        break
      }
      await wait(backoff(response, attempt), undefined, { signal })
    }
    const text = await response.text()
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new Error(`${path}: HTTP ${response.status}，上游返回 ${response.headers.get('content-type') || '未知类型'}，不是 JSON`)
    }
    if (!response.ok || (payload.code !== undefined && payload.code !== 0)) throw new UpstreamError(path, response.status, payload)
    return payload.data
  }

  return { account, request, headers }
}
