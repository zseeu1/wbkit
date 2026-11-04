# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

在 magpie 里使用 WorkBuddy 的个人用户（通过社区插件登录 WorkBuddy），以及本插件的作者本人。典型场景：日常维护多个 WorkBuddy 国内个人账号——导入/导出/切换账号、看余额与积分包、每日签到、派猫猫旅行、跑成长任务、查模型与用量。多个账号是常态（作者本机 3 个）。

## Product Purpose

把 magpie 上 WorkBuddy 的日常操作集中到一个插件、一个账号页：让用户看清每个账号的状态与积分，常用动作（签到 / 旅行 / 成长任务）能一键或定时完成，不必手动跑 CLI 或在多个插件之间来回。成功 = 打开账号页几秒内看清"哪些账号可用、还剩多少积分、今天该做什么"，并能直接做完。

## Positioning

补位而非替代。供应商、登录、请求签名与余额接口由社区插件 `@magpie-community/opencode-workbuddy-auth` 提供；wbkit 只补它没有的部分（账号池、签到补位、猫猫旅行、成长任务流水线、模型目录、官方用量、账号页），**不注册 provider、不接管登录**，因此不会和社区插件抢 provider id，也不会在供应商页多出"未登录"卡。

## Operating Context

- 运行在 magpie 插件宿主内；账号登录态来自 `~/.config/magpie/plugin-auth.json`。
- 插件页是沙盒 iframe：**没有网络、不能弹窗**；数据来自插件加载时写的一份 `page/data.js` 只读快照，页面「刷新」按钮通过改 options 触发插件重载、重新生成快照。
- 服务对象是**国内版个人账号**（provider `workbuddy`、无 `enterpriseId`）；国际版只做只读展示。
- 依赖 magpie 原生的 WorkBuddy 签到记录（`workbuddy-checkin.json`）做补位判定。

## Capabilities and Constraints

能力：
- 账号池：导入 / 导出（wb-switch 格式）/ adopt（把孤儿账号键改回已装插件声明的 id）
- 每日签到：先看 magpie 原生记录，没签过才补；可开关 + 时间
- 猫猫旅行：开关 + 间隔（默认 30 分钟），插件加载/请求时按间隔推进
- 成长任务：`wbkit_growth action=task` 走进程内引擎流水线（接取→点亮→轮询→达标领奖）；可选 `autoTasks` 每日按北京时间自动跑一轮
- 模型目录：`wbkit_models` 直连读 `/v3/config`（只读，不调模型、不花积分）
- 官方用量：`wbkit_usage`
- 账号页：卡片 / 紧凑两种密度；余额、积分包（前 5，总数另记）、健康、签到、旅行、今日统计、提醒、任务进度、最近执行历史；每账号 签到/旅行/成长 按钮

约束：
- 0.5.0 起**没有本地服务/端口**，全部在插件进程内跑
- ESM、零 npm 依赖、测试用 `node:test`
- 沙盒页不能联网，所有动作只能写进 options 由插件在加载/请求时消费
- 令牌（access/refresh）**绝不进页面快照**；含 token 的导出只在显式点「导出」时生成

明确未决：
- `autoTasks` 默认关闭，由用户在面板里自行开启
- 国际版只读展示，不做国际版任务自动化

## Brand Commitments

- 名称：`wbkit`
- 界面语言：中文
- 主色：WorkBuddy 品牌绿（约 `#0f9c78`，派生渐变 `#00cfa8 → #17be6b`）
- 令牌绝不进页面快照

## Evidence on Hand

- 仓库 `zseeu1/wbkit`：README、CHANGELOG、NOTICE、62 条测试；真实市场验证来自 GitHub issues（Windows 路径、Docker 路径、任务调度等）。
- 真实账号、余额、令牌仅存在于本机 `~/.config/magpie`，不得写入仓库、页面快照或对外传播。
- 没有对外 testimonials、客户案例、benchmark 数据；未来工作不得编造。

## Product Principles

1. 补位不越界：不接管登录/provider，不与社区插件冲突。
2. 安全优先：只读快照，令牌不落页面。
3. 常用动作要一键或定时，不逼用户跑 CLI。
4. 诚实显示：读不到就说原因（桌面登录 / API key / 登录异常），不假装成功。
5. 轻量：无守护进程、零依赖、单插件装完即用。

## Accessibility & Inclusion

中文为主要界面语言；颜色对比满足正文可读性；交互使用原生 `input`/`button`，键盘可达。
