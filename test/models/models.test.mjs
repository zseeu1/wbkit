import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { catalog, creditsOf, intlModels } from '../../lib/models.mjs'

const now = Date.parse('2026-11-02T15:00:00+08:00')
const config = JSON.parse(readFileSync(new URL('./fixtures/v3-config.json', import.meta.url), 'utf8'))

test('creditsOf 认得 WorkBuddy 用过的每种倍率写法；Auto 的空串浮动', () => {
  assert.deepEqual(['x0.34 credits', 'x0.00', '0.50x', '0x', 0, '', null, 'abc'].map(creditsOf), [0.34, 0, 0.5, 0, 0, null, null, null])
})

test('catalog() 从 /v3/config fixture 解析出 rate / context / tier / promo', () => {
  const list = catalog(config, now)
  const byId = Object.fromEntries(list.map((m) => [m.id, m]))
  // rate 与 context（maxInputTokens）都读出来了
  assert.equal(byId.auto.rate, null)
  assert.equal(byId.auto.context, 256000)
  assert.equal(byId.auto.isDefault, true)
  assert.equal(byId['glm-5.2'].rate, 0.79)
  assert.equal(byId['glm-5.2'].context, 128000)
  // tier：Pro Only 挡免费，订阅优先只排队
  assert.equal(byId['gpt-x'].tier.exclusive, true)
  assert.equal(byId['glm-5.3'].tier.exclusive, false)
  assert.equal(byId['gpt-x'].tier.label, 'Pro Only')
  // promo：白天徽标 + 夜间定价合成一个，倍率 0.5
  assert.deepEqual([byId['glm-5.2'].promo.label, byId['glm-5.2'].promo.hours, byId['glm-5.2'].promo.rate], ['夜间折扣', '23:00–07:50', 0.5])
  assert.equal(byId['hy3-x'].promo, undefined, '过期的促销丢掉')
})

test('catalog 是 CLI 的列表、按顺序，带档位、在跑的促销，同名 id 用后缀区分', () => {
  const list = catalog(config, now)
  assert.deepEqual(list.map((m) => [m.id, m.name, m.rate]), [
    ['auto', 'Auto', null],
    ['hy3', 'Hy3', 0],
    ['hy3-x', 'Hy3 (X)', 0.05],
    ['glm-5.2', 'GLM-5.2', 0.79],
    ['gpt-x', 'GPT-X', 1.33],
    ['glm-5.3', 'GLM-5.3', 0.69],
    ['ds', 'DeepSeek', 0.11],
  ])
  assert.equal(list[0].isDefault, true)
  assert.deepEqual([list[4].tier.exclusive, list[5].tier.exclusive], [true, false])
  assert.equal(list[2].promo, undefined, '已经结束的促销被丢掉')
  assert.deepEqual(
    { ...list[1].promo, note: undefined },
    { label: '限时免费', note: undefined, hours: '', until: Date.parse('2026-11-16T00:00:00+08:00'), rate: 0 },
  )
  // 只有徽标的白天促销和真正定价的夜间促销读成同一个。
  assert.deepEqual(
    [list[3].promo.label, list[3].promo.hours, list[3].promo.rate, list[3].promo.approx],
    ['夜间折扣', '23:00–07:50', 0.5, undefined],
  )
  // DeepSeek 的折扣只在文字里：「5折」于 ×0.11，错峰，作为估算。
  assert.deepEqual([list[6].promo.hours, list[6].promo.rate, list[6].promo.approx], ['非高峰', 0.06, true])
})

test('国际版读到列表与套餐；过期登录只报错不续期', async () => {
  const seen = []
  const fetcher = async (url, init) => {
    seen.push([new URL(url).pathname, init.method, init.headers.Authorization])
    return Response.json({ code: 0, data: url.endsWith('/v3/config') ? config : { SubscriptionPackageName: 'Free', IsPaidUser: false } })
  }
  const account = { name: 'abroad', auth: { uid: 'u9', access: 'intl-access', expires: now + 86400_000 } }
  const got = await intlModels(account, { fetcher, now })
  assert.deepEqual(got.plan, { name: 'Free', paid: false })
  assert.equal(got.models.length, 7)
  assert.deepEqual(seen, [
    ['/v3/config', 'GET', 'Bearer intl-access'],
    ['/billing/meter/get-user-resource-summary', 'POST', 'Bearer intl-access'],
  ])
  await assert.rejects(intlModels({ ...account, auth: { ...account.auth, expires: now - 1 } }, { fetcher, now }), /国际版登录已过期/)
  assert.equal(seen.length, 2)
})
