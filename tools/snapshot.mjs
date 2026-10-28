#!/usr/bin/env node
// 手动重生成 page/data.js（magpie 每次加载插件时也会自己写一遍）。
import { writeView } from '../lib/view.mjs'

const file = await writeView()
console.log('写入', file)
