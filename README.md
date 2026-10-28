# wbkit

**一个 magpie 插件，把 WorkBuddy 的事一次做完。** 供应商与登录、账号池导入、积分余额与到期、每日签到、猫猫旅行、官方用量——装一个，不再装三个。

```
WorkBuddy (19 models)  signed in as …        ← 供应商由本插件提供
插件 → WorkBuddy                              ← 账号页：余额、积分包、签到、旅行
wbkit_pool / wbkit_growth / wbkit_usage       ← 给 agent 的三个工具
```

## 为什么是「一个」

原来要装三样东西才凑齐：`opencode-workbuddy-auth`（供应商 + 登录）、`magpie-workbuddy-pool`（账号池导入）、`magpie-workbuddy-growth`（签到与成长计划）。它们各写各的，登录态凑巧都在 `plugin-auth.json` 里才没有打架。

wbkit 把它们收进一个包，按 magpie 自己的钩子分工：

| 钩子 / 位置 | 负责什么 | 显示在哪 |
|---|---|---|
| `provider` / `auth` | 两个 provider（国内 / 国际）、三种登录、续期、企业头 | 供应商页 |
| `auth.usage` | 余额、额度窗口、cycle / 作废时间（沿用上游实现，含 401 自愈与企业额度） | 供应商账号卡、`magpie quota` |
| `auth.checkin` | 每日签到 | 账号卡、签到记录 |
| `tool` | 账号池导入、成长计划、用量明细 | 任何 agent（MCP） |
| `page` | 账号总览、逐包明细、签到与旅行开关 | 侧栏「WorkBuddy」 |

## 安装

```bash
magpie plugin add github:zseeu1/wbkit
magpie plugin use wbkit workbuddy        # 让本插件接管 provider id
magpie quota                             # 能看到每个账号的余额与到期就对了
```

开发时用文件夹就地加载，改完关掉再打开插件即可：

```bash
magpie plugin add ./wbkit
```

装好后在 设置 → 插件 里，本插件应当只有一行；`workbuddy` / `workbuddy-ai` 由它提供。

## 登录

三种方式，都不需要复制粘贴令牌：

- **浏览器登录**：`magpie plugin login workbuddy`，打开 WorkBuddy 自己的登录页，扫码/账号密码都行；
- **桌面登录态**：直接用 WorkBuddy 桌面 App 已登录的账号（读它的认证文件；5.6 起该文件加密，此时改用浏览器登录）；
- **API Key**：在 WorkBuddy 的 keys 页面生成，登录时选 API Key 方式填入。

三种方式在 `magpie plugin login workbuddy` 里按提示选；应用里则显示成供应商页上的按钮。

一个 provider 可以登多个账号：第一个存在 `workbuddy`，之后的是 `workbuddy#<摘要>`。想批量导入就往下看 `wbkit_pool`。

## 每日签到

页面底部有「每日签到」：开关 + 时间（默认 09:05，北京时间）+「立即签到」按钮。

| 触发 | 说明 |
|---|---|
| 插件加载 | 开 magpie、改插件选项、开关插件 |
| `auth.usage` | 打开供应商页、跑 `magpie quota` |
| 「立即签到」 | 不等时间，立刻跑一轮 |

一天一次：签到成功的账号当天跳过；结果写进 `~/.config/magpie/wbkit-checkin.json`，页面和账号卡都会显示。失败会在页面标红并给出原因（`要验证码 / 失败 / 无资格`），点「立即签到」重试。

magpie 内置的「预热与签到」如果也开着同一供应商，两边调用的是同一个 `auth.checkin`，第二次只会拿到「今天已签到」，不会重复领。

## 猫猫旅行

第二张控制卡：显示每只猫的状态（还没有猫 / 在家待着 / 出门旅行中 / 已到达可领奖、今日是否到上限），带间隔（默认 30 分钟）和开关。

走动是**一次一步**：没猫就领养，`idle` 派出，`arrived` 领奖，`traveling` 跳过。触发点与签到相同，另有「推进一步」按钮即时触发。

## 三个工具

装好后任何 agent 都能调（magpie 通过 `/mcp/magpie/tools` 暴露）：

```
wbkit_pool    --action import|list|check  [--path <导出 JSON>] [--uid <前缀>] [--probe true|false]
wbkit_growth  --action status|task|school|travel|streak|daily  [--code …] [--only …] [--lottery true]
wbkit_usage   --period 1d|7d|30d  [--uid <前缀>] [--detail <0-1000>]
```

- `wbkit_pool import` 不指 `path` 时先扫 `~/.config/magpie/workbuddy-pool/*.json`，再退回 `~/.wb-switch/accounts.json`；导入幂等，账号名优先用导出里的昵称。
- `wbkit_usage` 只返回 `requestId / model / credit / client / requestTime`，**接口里的提示词原文一个字节都不留**。
- `wbkit_growth` 只对国内个人账号（无 `enterpriseId`）生效。

终端里同样能调：

```bash
magpie tool wbkit_usage --period 7d --detail 20
magpie tool wbkit_growth --action status
```

## 页面

侧栏「WorkBuddy」，版面照 wb-switch 的账号页：

- 顶部汇总：可用积分 / 账号数 / 最近作废；
- 分档：全部 · 国内版 · 国际版；
- **两种密度**：卡片（大号余额 + 每个积分包的进度条）与紧凑（一行一个账号，账号多了也不占屏）；
- 底部：签到与旅行的开关、时间、以及「立即」按钮。

页面跑在沙盒 iframe 里（`connect-src 'none'`），既不能联网也读不到账号，所以数据来自插件加载时写的 `page/data.js`——只含昵称、区域、余额、到期这类字段，**不含任何令牌**。

## 选项

页面上的开关都写进插件 options，也可以命令行改：

```bash
magpie plugin options wbkit '{"autoCheckin":true,"checkinAt":"09:05","autoTravel":true,"travelEveryMin":30,"density":"card"}'
```

| 键 | 默认 | 含义 |
|---|---|---|
| `autoCheckin` | `false` | 每日签到开关 |
| `checkinAt` | `09:05` | 北京时间，到点后才签 |
| `autoTravel` | `false` | 猫猫旅行自动推进开关 |
| `travelEveryMin` | `30` | 旅行推进间隔（最小 5） |
| `density` | `card` | 页面密度：`card` / `compact` |
| `tab` | `all` | 页面分档：`all` / `cn` / `intl` |
| `pendingCheckin` / `pendingTravel` | — | 页面按钮写入的即时请求，插件消费后不再触发 |

## 数据来源

全部现取官方接口，**不读任何第三方缓存**：

| 数据 | 端点 |
|---|---|
| 余额 / 额度窗口（账号卡） | 上游 `get-user-resource-summary`，带 401 自愈与企业额度 |
| 逐包明细（页面） | `POST https://copilot.tencent.com/v2/billing/meter/get-user-resource`（body `{}`），按 `PackageName` 合并 |
| 请求用量 | `POST https://www.workbuddy.cn/billing/meter/get-user-request-usage`（国际版 `www.workbuddy.ai` 同构） |
| 每日签到 | `POST https://copilot.tencent.com/v2/billing/meter/daily-checkin` |
| 成长 / 旅行 | `copilot.tencent.com` 的 activity 接口（见 `lib/growth.mjs`） |

请求头照抄 WorkBuddy 桌面客户端；余额接口按 `CycleEndTime` 过滤已结束的包，按 `PackageName` 合并，`DeductionEndTime` 超过两年视为长期有效（官方有 2049 这类占位值）。

## 目录

```
index.mjs            插件入口：只导出两个插件函数，其余挂 _internal
vendor/workbuddy.mjs 上游社区插件 0.1.41 原样（MIT，见 NOTICE）
lib/quota.mjs        auth.usage：余额 / 积分包 / 到期
lib/checkin.mjs      auth.checkin：每日签到
lib/schedule.mjs     签到的调度与状态（一天一次、手动请求消费）
lib/pet.mjs          猫猫旅行：状态查询与推进
lib/usage.mjs        官方用量：分页扫描 + 按天/模型聚合
lib/growth.mjs       成长计划（点任务树、开学季、连登、旅行原语）
lib/api.mjs          billing 接口与请求头（余额 / 用量 / 签到共用）
lib/{pools,importer,store,region,wb,snapshot}.mjs   账号池：归一化、导入、原子写、区域判定、探针、快照工具
lib/view.mjs         页面快照（白名单字段，无令牌）
lib/tools.mjs        三个工具的实现
page/                index.html / app.js / style.css / icon.svg（data.js 生成，不入库）
scripts/sync-upstream.mjs   跟版上游并校验导出
tools/{import,verify,snapshot}.mjs  命令行：导入、巡检、重生成快照
test/                node --test，24 条
```

## 开发

```bash
node --test test/            # 24 条：区域、导入幂等、余额口径、签到判定、用量聚合、快照不含令牌
node scripts/sync-upstream.mjs        # 从本机已装的社区插件更新 vendor
node scripts/sync-upstream.mjs --npm  # 或从 npm 拉最新版
node tools/snapshot.mjs      # 手动重生成 page/data.js
```

`sync-upstream.mjs` 会校验上游仍然导出 `WorkBuddyAuthPlugin` / `WorkBuddyAIAuthPlugin` / `_internal`，上游改结构时先报警而不是静默挂掉。

## 边界

- **不做**切客户端登录态（WorkBuddy 桌面、CodeBuddy IDE/CLI、VS Code、JetBrains）：magpie 是网关，账号在 provider 层轮换，不需要改别人的文件。
- **不做**会话复制 / 关联同步：那是 `~/.workbuddy` 下的 SQLite 与 JSONL 写入，风险和收益不成比例。
- **不做**自动轮换：magpie 的 Routing 已经在做。

## 许可

MIT。`vendor/workbuddy.mjs`、`lib/growth.mjs`、`lib/{pools,importer,store,region,snapshot,wb}.mjs` 来自 MIT 许可的社区项目，出处见 [NOTICE](NOTICE)。
