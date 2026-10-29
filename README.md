# wbkit

**补在社区插件后面的那一半。** 供应商、登录、请求与余额展示交给 [`@magpie-community/opencode-workbuddy-auth`](https://github.com/magpie-community/plugins/tree/main/packages/workbuddy)；本插件补上它没有的：账号池导入、每日签到、猫猫旅行、成长计划、官方用量，以及一个账号页。

```
@magpie-community/opencode-workbuddy-auth   →  WorkBuddy (19 models) / 登录 / 余额
wbkit                                       →  账号页、签到、旅行、成长、用量、三个工具
```

不复制上游代码，也不再 vendor：上游更新直接跟上，本插件只依赖 `plugin-auth.json` 里的登录态。

## 分工

| 谁 | 负责 | 显示在哪 |
|---|---|---|
| 社区插件 `opencode-workbuddy-auth` | 两个 provider（国内 / 国际）、三种登录、请求签名、续期、企业头、`auth.usage`（余额 / 额度窗口 / cycle / 作废时间） | 供应商页、`magpie quota` |
| magpie 自带 | WorkBuddy 原生签到（`~/.config/magpie/workbuddy-checkin.json`）、内置「预热与签到」调度 | 用量页的「自动签到 / 立即签到」 |
| **wbkit** | 账号池导入、签到补位、猫猫旅行、成长计划、官方用量、账号页 | 侧栏「WorkBuddy」+ 三个工具 |

本插件不注册 `provider` / `auth`，所以不会和社区插件抢供应商 id，也不会顶掉它的 `auth.usage`；唯一会碰的是「签到」——它先看 magpie 原生签到有没有签过，签过就不发请求。

## 安装

先有登录，再补这一半：

```bash
magpie plugin add @magpie-community/opencode-workbuddy-auth    # 供应商 + 登录
magpie plugin login workbuddy                                  # 浏览器 / 桌面登录态 / API Key

magpie plugin add github:zseeu1/wbkit                          # 本插件
magpie quota                                                   # 余额卡来自社区插件
```

开发时用文件夹就地加载，改完关掉再打开插件即可：

```bash
magpie plugin add ./wbkit
```

装好后 设置 → 插件 里会有两行：社区插件那行带 `workbuddy (19 models)`，wbkit 那行带 `page` 与 `tools`。

## 登录

三种方式，都不需要复制粘贴令牌：

- **浏览器登录**：`magpie plugin login workbuddy`，打开 WorkBuddy 自己的登录页，扫码/账号密码都行；
- **桌面登录态**：直接用 WorkBuddy 桌面 App 已登录的账号（读它的认证文件；5.6 起该文件加密，此时改用浏览器登录）；
- **API Key**：在 WorkBuddy 的 keys 页面生成，登录时选 API Key 方式填入。

三种方式在 `magpie plugin login workbuddy` 里按提示选；应用里则显示成供应商页上的按钮。

一个 provider 可以登多个账号：第一个存在 `workbuddy`，之后的是 `workbuddy#<摘要>`。想批量导入就往下看 `wbkit_pool`。

### 社区插件登录的账号在 wbkit 页面上

同一份 `plugin-auth.json`、按 provider 前缀认，所以**三种登录都会出现在 wbkit 的账号页**；能读到多少取决于令牌在不在 store 里：

| 登录方式 | 出现在页面 | 余额 / 积分包 | 签到 | 猫猫旅行 / 成长 |
|---|---|---|---|---|
| 浏览器 | ✅ | ✅ 现取官方接口 | ✅ | ✅ |
| 桌面登录态 | ✅（显示账号名） | ❌ 令牌在 WorkBuddy 客户端里、每次由社区插件现取；余额看 magpie 供应商页 | ❌ 没有可用的 access | ❌ |
| API Key | ✅（标签 `API key ·尾四位`） | ❌ WorkBuddy 客户端用 key 也不显示积分 | ❌ | ❌ |

页面对读不到余额的那两类只写一句原因（`kind` 字段标明 `oauth` / `desktop` / `api`），不会去打接口也不会显示成「读取失败」。

## 每日签到

页面底部有「每日签到」：开关 + 时间（默认 09:05，北京时间）+「立即签到」按钮。

| 触发 | 说明 |
|---|---|
| 插件加载 | 开 magpie、改插件选项、开关插件 |
| `auth.usage` | 打开供应商页、跑 `magpie quota` |
| 「立即签到」 | 不等时间，立刻跑一轮 |

一天一次：签到成功的账号当天跳过；结果写进 `~/.config/magpie/wbkit-checkin.json`，页面和账号卡都会显示。失败会在页面标红并给出原因（`要验证码 / 失败 / 无资格`），点「立即签到」重试。

### 签到怎么补位

本插件没有 `auth.checkin`（那需要在提供 provider 的插件里），而是自己调 `POST /v2/billing/meter/daily-checkin`，所以不依赖谁提供 provider。

### 与 magpie 自带签到的关系

WorkBuddy 是 magpie **原生支持签到**的供应商之一，它自己会把结果写在 `~/.config/magpie/workbuddy-checkin.json`（键是 `workbuddy|<uid>`，带 `credit` / `streak`），用量页那个「自动签到 / 立即签到」走的就是这条原生路径，**不依赖任何插件**。

所以本插件的 `auth.checkin` 只做补位，并且默认让路：跑之前先看 `workbuddy-checkin.json`（原生）和 `plugin-checkin.json`（插件钩子）——任一本今天已有该账号的记录，就直接记 `done`、不发请求。页面会把来源标成 `magpie`。

想让 magpie 原生那条独家负责，把页面「每日签到」关掉即可；两条都开也不会重复领。

## 猫猫旅行

第二张控制卡：显示每只猫的状态（还没有猫 / 在家待着 / 出门旅行中 / 已到达可领奖、今日是否到上限），带间隔（默认 30 分钟）和开关。

走动是**一次一步**：没猫就领养，`idle` 派出，`arrived` 领奖，`traveling` 跳过。触发点与签到相同，另有「推进一步」按钮即时触发。

## 导入 / 导出账号

页面上有一张「导入 / 导出账号」卡片：

- **导入**：把 wb-switch 导出的整份 JSON 粘进文本框 → 「导入到 magpie」。支持数组、`{accounts:[…]}`、单对象三种形状，同 `uid` 多份只留活得最久的那份，账号名优先用昵称。
- **导出**：点「导出 wb-switch 格式」，插件把 magpie 里的账号写成 `~/.config/magpie/wbkit-export-<时间>.json`（与 wb-switch 的导出同构，含 `auth_raw.auth`），页面显示文件名与条数。**文件里有令牌，等同密码**，别上传网盘。

命令行同样有（适合换机器 / 脚本备份）：

```bash
magpie tool wbkit_pool --action import --path ~/Downloads/wb-switch-accounts.json
magpie tool wbkit_pool --action export --path ~/Desktop/wb-switch-backup.json
magpie tool wbkit_pool --action list
magpie tool wbkit_pool --action check
```

### 导入的账号怎么才能被社区插件认到

magpie 的登录态键只有两种形状被认（`lib/keys.mjs` 写清楚了）：

| 键 | 含义 |
|---|---|
| `workbuddy` | 这个 provider 的**第一个账号**，也是默认账号 |
| `workbuddy#<后缀>` | 第二个及以后；后缀内容不参与判断 |

插件宿主按「键等于 provider 或以 `provider#` 开头」找账号，社区插件的 `getAuth()` 再从中取；所以**前缀必须是它声明的 id**（`workbuddy` / `workbuddy-ai`）。wbkit 导入按这个规则落键：第一个账号用裸键，其余沿用各自的后缀。

老版本的 wbkit 曾按当时的 id 写成 `codebuddy#…`，这些键在 magpie 的 provider 列表里是孤儿，社区插件看不到。**插件每次加载时会自动搬一次**（改键名，token 一字不动，幂等），也可以手动：

```bash
magpie tool wbkit_pool --action adopt
```

有 `client` 时走宿主的 `auth.set`，搬完 magpie 不用重启就能看到；没有时直接改文件，重启后生效。

## 三个工具

装好后任何 agent 都能调（magpie 通过 `/mcp/magpie/tools` 暴露）：

```
wbkit_pool    --action import|export|adopt|list|check  [--path <导出 JSON>] [--uid <前缀>] [--probe true|false]
wbkit_growth  --action status|task|school|travel|streak|daily  [--code …] [--only …] [--lottery true]
wbkit_usage   --period 1d|7d|30d  [--uid <前缀>] [--detail <0-1000>]
```

- `wbkit_pool import` 不指 `path` 时先扫 `~/.config/magpie/workbuddy-pool/*.json`，再退回 `~/.wb-switch/accounts.json`；导入幂等，账号名优先用导出里的昵称。
- `wbkit_pool export` 写 wb-switch 格式（含令牌），用于换机器与备份。
- `wbkit_pool adopt` 把孤儿账号键（如 `codebuddy#…`）搬到已装社区插件声明的 id 上；插件加载时也会自动做一次。
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

## 供应商 id 的两套写法

magpie 0.1.1993 曾把内置供应商改叫 `codebuddy`，账号键随之从 `workbuddy#…` 变成 `codebuddy#…`；社区插件 `@magpie-community/opencode-workbuddy-auth` 声明的仍是 `workbuddy` / `workbuddy-ai`。

本插件的读法：provider id 或登录态里的域命中 `workbuddy|codebuddy` 都算 WorkBuddy 账号，国际版按 `-ai` 或 `.ai` 域判断（所以老数据不会从页面上消失）。
写法：**一律写已装插件声明的 id**（`servedIds()` 读它的 `package.json` 确认），孤儿键由加载时的自动 adopt 搬过去。

## 数据来源

全部现取官方接口，**不读任何第三方缓存**：

| 数据 | 端点 |
|---|---|
| 余额 / 额度窗口（账号卡，若装了社区插件） | 社区插件自己的 `auth.usage` |
| 逐包明细（页面） | `POST https://copilot.tencent.com/v2/billing/meter/get-user-resource`（body `{}`），按 `PackageName` 合并 |
| 请求用量 | `POST https://www.workbuddy.cn/billing/meter/get-user-request-usage`（国际版 `www.workbuddy.ai` 同构） |
| 每日签到 | `POST https://copilot.tencent.com/v2/billing/meter/daily-checkin` |
| 成长 / 旅行 | `copilot.tencent.com` 的 activity 接口（见 `lib/growth.mjs`） |

请求头照抄 WorkBuddy 桌面客户端；余额接口按 `CycleEndTime` 过滤已结束的包，按 `PackageName` 合并，`DeductionEndTime` 超过两年视为长期有效（官方有 2049 这类占位值）。

## 目录

```
index.mjs            插件入口：只导出一个插件函数（工具 + chat.headers 时机，其余挂 _internal）
lib/quota.mjs        auth.usage：余额 / 积分包 / 到期
lib/checkin.mjs      auth.checkin：每日签到
lib/schedule.mjs     签到的调度与状态（一天一次、手动请求消费）
lib/pet.mjs          猫猫旅行：状态查询与推进
lib/usage.mjs        官方用量：分页扫描 + 按天/模型聚合
lib/growth.mjs       成长计划（点任务树、开学季、连登、旅行原语）
lib/api.mjs          billing 接口与请求头（余额 / 用量 / 签到共用）
lib/{pools,importer,store,region,wb,snapshot}.mjs   账号池：归一化、导入、原子写、区域判定、探针、快照工具
lib/keys.mjs         账号键规则：裸键=默认账号、#后缀=其余；给导入/搬家共用
lib/adopt.mjs        把孤儿账号键搬到社区插件声明的 id（加载时自动跑，幂等）
lib/view.mjs         页面快照（白名单字段，无令牌）
lib/tools.mjs        三个工具的实现
page/                index.html / app.js / style.css / icon.svg（data.js 生成，不入库）
tools/{import,verify,snapshot}.mjs  命令行：导入、巡检、重生成快照
test/                node --test，50 条
```

## 开发

```bash
node --test test/*.test.mjs  # 50 条：登录方式识别、账号键规则、孤儿键搬家、导入幂等、余额口径、签到判定、用量聚合、快照不含令牌
node tools/snapshot.mjs      # 手动重生成 page/data.js
```

## 边界

- **不做**切客户端登录态（WorkBuddy 桌面、CodeBuddy IDE/CLI、VS Code、JetBrains）：magpie 是网关，账号在 provider 层轮换，不需要改别人的文件。
- **不做**会话复制 / 关联同步：那是 `~/.workbuddy` 下的 SQLite 与 JSONL 写入，风险和收益不成比例。
- **不做**自动轮换：magpie 的 Routing 已经在做。

## 许可

MIT。`lib/growth.mjs`、`lib/{pools,importer,store,region,snapshot,wb}.mjs` 来自 MIT 许可的社区项目，出处见 [NOTICE](NOTICE)。供应商与登录不在本包内，由社区插件提供。
