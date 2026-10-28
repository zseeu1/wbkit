# wbkit

WorkBuddy 全家桶：**一个 magpie 插件**做完供应商登录、账号池、积分余额与到期、每日签到、成长计划、官方用量。装一个，不再装三个。

## 装

```bash
magpie plugin add ./wbkit            # 文件夹就地加载（在仓库上一级目录执行）
magpie plugin use wbkit workbuddy                      # 让它接管 provider id
magpie quota                                           # 应看到每个账号的积分余额与到期
```

`vendor/workbuddy.mjs` 是 `@magpie-community/opencode-workbuddy-auth` 0.1.41 的原样副本（MIT），所以 `workbuddy` / `workbuddy-ai` 两个 provider、三种登录方式（浏览器 OAuth / 桌面 App 文件 / API Key）、续期与企业头全部照旧，agent 侧不需要改任何 `workbuddy/模型` 的写法。

## 它替掉的东西

| 以前 | 现在 |
|---|---|
| `@magpie-community/opencode-workbuddy-auth`（provider/登录/续期） | vendor 进本包 |
| `magpie-workbuddy-pool`（导入/区域/健康/提前续期/账号页） | `wbkit_pool` 工具 + 本包 page |
| `magpie-workbuddy-growth(-core)`（任务树/旅行/连登/开学季） | `wbkit_growth` 工具；签到改由 `auth.checkin` 承担 |
| wb-switch 的缓存文件（用量/签到/旅行/通知） | **运行时不再依赖**；数据全部现取官方接口 |

## 三个钩子

- **`auth.refresh` / `refreshLead`（5 分钟）**：沿用上游，magpie 在 access 到期前 5 分钟续期并写回。
- **`auth.usage`**：`POST {base}/v2/billing/meter/get-user-resource` → 按 `PackageName` 分组的积分窗口，`balance` / `limit` / `runsOutAt`。显示在供应商账号卡与 `magpie quota`。60 秒/账号缓存；401/403 抛 `signIn: "expired"`。
- **`auth.checkin`**：`POST {base}/v2/billing/meter/daily-checkin`，映射成 `claimed / done / captcha / ineligible / failed`。magpie 每个北京日为每个账号调一次；`options.takeOverCheckin=false` 可整体让位给外部工具。

## 三个工具（经 `/mcp/magpie/tools` 给所有 agent）

```
wbkit_pool    --action import|list|check  [--path <导出 JSON>] [--uid <前缀>] [--probe true|false]
wbkit_growth  --action status|task|school|travel|streak|daily  [--code <任务>] [--only <任务>] [--lottery true]
wbkit_usage   --period 1d|7d|30d  [--uid <前缀>] [--detail <0-1000>]
```

`wbkit_pool import` 不指定 `path` 时先扫池目录 `~/.config/magpie/workbuddy-pool/*.json`，再退回 `~/.wb-switch/accounts.json`；导入幂等，账号名优先用导出里的昵称。

## 数据来源（都是官方接口，实测）

| 数据 | 端点 |
|---|---|
| 积分余额/到期 | `POST https://copilot.tencent.com/v2/billing/meter/get-user-resource`（body `{}`）→ `data.Response.Data.Accounts[]` |
| 请求用量 | `POST https://www.workbuddy.cn/billing/meter/get-user-request-usage`（`{startTime,endTime,pageNum,pageSize}`）→ `data.data[]` |
| 每日签到 | `POST https://copilot.tencent.com/v2/billing/meter/daily-checkin` |

口径校验：两个账号的余额、积分包数与 7 天用量，和 wb-switch 自己的显示逐项对上（示例仓库里不写具体数值）。

**不采集**：用量接口返回里的 `input` / `inputTrunc`（提示词原文）。`page/data.js` 只写昵称、区域、到期时间这类元数据，不含 `access` / `refresh` 令牌。

## 页面

侧栏「WorkBuddy」，版面照 wb-switch 的账号页：顶部汇总（可用积分 / 账号 / 最近作废）、全部·国内版·国际版分档、每张卡是大号余额 + 每个积分包的余额与到期进度条（≤2 天橙、≤10 天浅橙、其余绿）+ 登录态倒计时。

**显示密度**：账号标题右边有「卡片 / 紧凑」切换。账号多的时候用紧凑模式，一行一个：昵称 + 区域 + 余额 + 包数 + 最近作废 + 登录态剩余 + 状态徽标，一屏能看几十行。选择记在插件 options 的 `density`。

页面在沙盒里没有网络，数据来自插件加载时写的 `page/data.js`（`globalThis.WBKIT`）：插件在加载时用与 `auth.usage` 同一个官方接口取一次余额与积分包，只写昵称、区域、余额、到期这类字段，令牌一个都不进快照。

手动重生成快照：`node tools/snapshot.mjs`。

## 图标

`page/icon.svg` 的青绿取自 WorkBuddy 自己的 app 图标（`WorkBuddy.app/Contents/Resources/icon.icns` 主色 `#00c0a0` → `#17be6b`），白 W 叠在渐变圆角块上；`package.json` 里 `magpie.icon` 是同一张图的 data URI。

## 猫猫旅行（页面上的开关）

第二张控制卡是「猫猫旅行」：显示每个账号的宠物状态（在家待着 / 出门旅行中 / 已到达可领奖 / 还没有猫、今日是否到上限），带一个间隔（默认每 30 分钟推进一步）和开关。

走动逻辑复用 growth 的 `runTravelOnce`：**一次只推进一步**——没有猫就领养，`idle` 派出，`arrived` 领奖，`traveling` 跳过。触发点与签到相同（插件加载 / 查余额 / 页面「推进一步」按钮），结果记在 `~/.config/magpie/wbkit-checkin.json` 的 `travel.accounts`。

## 每日签到（页面上的开关）

页面底部有「每日签到」开关和一个时间框（默认 09:05，北京时间）。开关写进插件自己的 options（`autoCheckin` / `checkinAt`），不需要去命令行，也不依赖 magpie 内置的「预热与签到」。

三个触发点：

1. 插件加载（开 magpie、改插件选项、开关插件）；
2. 每次 magpie 查这个账号余额（`auth.usage`）——打开供应商页或跑 `magpie quota`；
3. 页面上的 **「立即签到」** 按钮：它只把 `pendingCheckin.at` 写进插件 options，宿主随即重载插件，加载时看到比上次新的时间戳就强制跑一轮（不等到点）。

失效了怎么办：页面底部会显示「上次失败：<账号> <原因> <时间>」，原因分 `要验证码 / 失败 / 无资格`，点「立即签到」重试即可；`captcha` 类要自己在 WorkBuddy 客户端里签一次。结果记在：

- `~/.config/magpie/wbkit-checkin.json`（每个账号的日期 / 结果 / 积分）
- 页面卡片上的签到徽标与页脚状态
- `magpie quota` 的供应商账号卡

另外仍然兼容 magpie 自己的调度：`auth.checkin` 是标准钩子，如果在 设置 → 预热与签到 里也开了，两边都会走到同一个实现，第二次返回 `done`，不会重复领。

## 维护

```bash
node scripts/sync-upstream.mjs        # 从本机已装的社区插件更新 vendor
node scripts/sync-upstream.mjs --npm  # 或从 npm 拉最新版
npm test                              # node --test，15 个用例
```

`sync-upstream.mjs` 会校验 `WorkBuddyAuthPlugin` / `WorkBuddyAIAuthPlugin` / `_internal` 三个导出仍在，上游改结构时先报警。

## 回滚

```bash
cp ~/.config/magpie/plugin-auth.json.pool.bak ~/.config/magpie/plugin-auth.json   # 需要时
magpie plugin rm ./wbkit
magpie plugin add github:xiaoli0412/magpie-workbuddy-pool
magpie plugin add @magpie-community/opencode-workbuddy-auth
```

## 许可

MIT。第三方代码与出处见 `NOTICE`。
