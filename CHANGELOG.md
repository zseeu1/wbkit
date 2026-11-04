# 更新记录

## v0.5.1

**页面细节打磨 + 两处部署问题修复**

- 紧凑视图：一行一账号，四个状态点（健康 / 签到 / 成长 / 旅行，按状态变色）；余额下方是「剩余/总量」进度条，末段按积分包到期时间上色（≤2 天橙、≤10 天绿橙）；点击整行展开详情
- 展开详情：左栏登录态 + 积分包明细，右栏签到 / 成长 / 猫猫旅行三块标题右侧直接给状态或动作（已签到 / 旅行中 / 已达上限 / 成长），签到不再单列时间
- 导入 / 导出：三个按钮一行（导入到 magpie、导出到 wb-switch、展开），导入导出信息一行；「清理」改为「已删除 N 个旧账号（本次导入里没有的）」，导出显示完整路径
- 页面最大宽度 1200px，卡片一行三张；卡片区块标题「近期作废」纠正为「积分包 · 前 5」
- 成长任务自动跑加防风控：到点随机推迟 0–5 分钟，账号之间随机间隔 4–10 秒；面板时间控件与签到 / 旅行对齐
- 修复签到 ±3 分钟抖动的状态引用错误（会抛 ReferenceError，且抖动不落盘）
- 修复 Docker 下配置目录找错：HOME 为 `/config/home` 时找不到真实的 `/config/magpie`（issue #4）
- 并入 Windows 上 `page/data.js` 写不出的修复（`URL.pathname` → `fileURLToPath`，issue #1 / #2 / PR #3）
- README 重写并补充截图（`docs/`，账号名已脱敏）
- 测试 65 条全绿

## v0.5.0

**去掉常驻本地服务/任务看板，全部进程内 + 面板快照**

- 删除 `service/`（daemon+看板）与 `magpie.page.service`、`wbkit_tasks` 工具、`service`/`servicePort` 选项；不再占端口、不起后台进程
- `wbkit_models` 改为**直连**（进程内读登录态、打 `/v3/config`），不依赖服务
- 面板新增只读区块：后台排程、今日统计、提醒（积分/登录快到期、需本人完成的任务）、**任务进度**（刷新时拉任务树算完成/进行中/待接）、最近执行历史；积分包显示前 5、总数另记
- 顶部「刷新」按钮：改 options → 重载插件重生成快照 → 整页重载（含余额与任务进度）
- 旅行仍在面板定时：开关 + 间隔（默认 30 分钟），插件加载/请求时推进
- `wbkit_growth action=task` 仍是进程内引擎流水线，并把结果追加到历史（面板读）
- 测试 60 条全绿

## v0.4.0

**合并两个 WorkBuddy 插件为一体（wbkit 仍是唯一要装的补位插件）**

- 并入 `jichie/magpie-workbuddy-tasks` 的批量任务引擎（`lib/engine/`）与本地服务（`service/`）：任务流水线「接取→点亮→轮询进度→达标才领奖」、任务级勾选、猫猫旅行、夜猫子、每日活跃、积分套餐明细、job/历史/SSE、风控冷却（1s 间隔、403/11140 冷却 120 分钟）
- 并入 `sabercomo/magpie-workbuddy-plus` 的模型目录与套餐视图（`lib/models.mjs`、`lib/wbclient.mjs`）：国内/国际模型、积分倍率、上下文、档位/促销、当前套餐；只读，不调模型、不花积分
- 新增工具 `wbkit_tasks`（status/run/wait/list/claim）与 `wbkit_models`
- **后台服务默认「懒启动」**：插件加载不起进程；用工具或点页面「打开看板」才拉起，空闲 30 分钟自动退出。选项 `service` = `lazy`(默认) / `on` / `off`；`magpie.page.service` 让看板在 magpie 窗口内打开（退回入口卡 + 地址）
- 安全加固（覆盖原 jichie 服务的无鉴权面）：只接受回环 Host（防 DNS rebinding，需反代时设 `WBKIT_ALLOWED_HOSTS`）、POST 必须 `application/json`（挡跨站表单）、只绑 127.0.0.1、CSP/nosniff、令牌永不进页面
- 调度唯一归属：服务在跑时旅行/夜猫交给引擎的北京时间窗口（09/21、01），wbkit 的间隔旅行让路，避免同账号重复旅行；签到仍先看 magpie 原生记录再补位
- 账号读取同时识别 `workbuddy`/`codebuddy` 两套 id（`lib/engine/store.mjs`），移植引擎不会因 magpie 改名读不到账号
- 测试 63 条（新增引擎口径、服务加固/生命周期、模型目录）
- 账号页新增「刷新」按钮（改 options 触发插件重载重生成快照）；面板直接显示后台排程、今日统计、提醒（积分/登录快到期）、最近执行历史；积分包改为全量（最多 50 个，来自本地 credits 缓存）+ 最早到期

## v0.3.1

- 账号页认识社区插件的三种登录（`lib/view.mjs`）：浏览器登录照常显示余额与积分包；桌面登录态与 API Key 也会列出来（分别显示账号名 / `API key ·尾四位`），但不再去打余额接口、不再显示成「读取失败」，而是写清为什么读不到
- 快照新增 `kind` 字段（`oauth` / `desktop` / `api` / `none`）；API Key 除尾四位外一个字节都不进页面
- 测试 50 条

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
