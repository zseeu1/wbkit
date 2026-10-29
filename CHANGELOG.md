# 更新记录

## v0.3.0

**修：wbkit 导入的账号现在能被 `opencode-workbuddy-auth` 认到**
- 账号键按 magpie 的实际规则落：第一个账号用裸键 `workbuddy`（默认账号），其余 `workbuddy#<后缀>`；前缀一律用已装社区插件声明的 id（`lib/keys.mjs`）
- 新增 `lib/adopt.mjs`：插件加载时自动把孤儿键（`codebuddy#…`）搬到 `workbuddy` / `workbuddy-ai`，只改键名、token 一字不动、幂等；有宿主 `client` 时走 `auth.set`/`auth.remove`，magpie 不重启也能看到账号
- 搬家时顺带把 `workbuddy-pool/state.json`、`wbkit-checkin.json`、`wbkit-transfer.json` 里的账号键一起改，余额/签到记录不会变孤儿
- 导出改为按「域或 id」认账号，不再只认 `workbuddy*` 前缀；同一份导出里的重复 uid 只导一次
- `wbkit_pool --action adopt` 保留，输出会说明是经宿主即时生效还是需要重启
- 修：状态文件目录不存在时导入报 ENOENT（新机器上第一次导入），现在自己建目录
- 测试 49 条（新增账号键规则、孤儿键搬家、导入后能被 `workBuddyAccounts` 认到）

## v0.2.4

- 新增 `wbkit_pool --action adopt`：magpie 改名后账号可能挂在一个没有插件声明的 id 上（`codebuddy#…`），供应商因此显示未登录；这条命令把账号键改回**已装插件真正声明的 id**（`workbuddy` / `workbuddy-ai`），摘要不变
- `servedIds()`：检测本机装的是哪个社区插件，导入/改名都以它声明的 id 为准，不再跟着 store 里可能已经没人认的前缀跑
- 测试 36 条

## v0.2.3

- 导入不再「看起来没反应」：同一 uid 已在 store 里就沿用它的摘要、只换 provider 前缀，页面显示「新增 X · 改名 Y · 清理 Z」；全是老账号时直接说「已是最新（N 个账号都在）」
- `added` 只统计真正新增的账号；导出到不可写路径时返回错误而不是抛异常
- 导出的关键修复：magpie 改名后重复导入不会再把旧键删掉重建，账号键从此稳定

## v0.2.2

- 推 `v*` 标签由 GitHub Actions 自动建 Release，正文取本文件里同名那一段（`.github/workflows/release.yml`）
- 版本号只做一次发版演练，功能与 v0.2.1 相同

## v0.2.1

**修：magpie 0.1.1993 改名后页面 0 账号**
- 账号识别改为「provider id 或域命中」：`workbuddy` / `workbuddy-ai` / `codebuddy` / `codebuddy-ai` 都认，国际版按 `-ai` 或 `.ai` 域判断
- 页面 0 账号时隐藏签到/旅行卡片，签到行只保留还存在的账号
- 导入时探测 store 里实际在用的那套 id 再落库，magpie 再改名也不会导进没人认的键
- `region` / `health` 兜底：状态文件缺新键时按 provider 判国内、能读出余额即 `ok`

**新：导入 / 导出账号**
- 页面上粘贴 wb-switch 导出的整份 JSON 即可导入（数组 / `{accounts:[…]}` / 单对象都认，同 uid 只留活得最久的一份，账号名用昵称）
- 「导出 wb-switch 格式」写成 `~/.config/magpie/wbkit-export-<时间>.json`，与 wb-switch 导出同构，换机器与备份可用；页面只显示文件名与条数
- 命令行：`wbkit_pool --action export|import|list|check`

## v0.2.0

- 去掉对 `opencode-workbuddy-auth` 的 vendor：供应商、登录、余额交回社区插件，本插件只做补位
- 入口只导出一个插件函数（`tool` + `chat.headers`），不再注册 `provider` / `auth`
- 签到自己调 `daily-checkin`，并先看 magpie 原生签到记录，签过不发请求

## v0.1.0

首个版本：账号池导入、余额与积分包、签到、猫猫旅行、成长计划、官方用量、账号页。
