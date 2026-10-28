import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from '../lib/checkin.mjs'

test('code 0 且带额度 → claimed', () => {
  const r = classify({ status: 200, json: { code: 0, data: { credit: 12, streakDays: 3 } } })
  assert.equal(r.outcome, 'claimed')
  assert.equal(r.credit, 12)
  assert.equal(r.streak, 3)
})

test('已签到 → done', () => {
  assert.equal(classify({ status: 200, json: { code: 400, msg: '今日已签到' } }).outcome, 'done')
  assert.equal(classify({ status: 409, json: { code: 409, msg: '已领取' } }).outcome, 'done')
})

test('验证码与无活动分开报', () => {
  assert.equal(classify({ status: 400, json: { msg: '请输入验证码' } }).outcome, 'captcha')
  assert.equal(classify({ status: 400, json: { msg: '当前无签到活动' } }).outcome, 'ineligible')
})

test('其它错误 → failed', () => {
  assert.equal(classify({ status: 500, json: { msg: 'boom' } }).outcome, 'failed')
})
