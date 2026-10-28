# magpie-workbuddy-growth

WorkBuddy 国内版成长中心管家（magpie 独立插件）。

- **任务树**：自动接任务 → 上报判据事件（桌面 6 连对话链 / Buddy 五连 /
  小程序任务 / 灵感库点击 / 画布·模板·专家·团队·技能·自动化·皮肤·和平精英皮肤）
  → 领取积分能量。黑猫任务只在 23:00–08:00（北京时间）跑，真实捐款类任务不碰。
- **猫猫旅行**：无猫→领养（每日防抖）→ 空闲→派出（古镇客栈）→ 到达→领奖，
  每次调用只推进一步。
- **连登**：昨日漏签且有补签卡→补签；7d/14d/28d 档位可兑换→兑换；有抽奖次数→抽奖（≤20 发）。
- **每日活跃**：上报一条 chat 事件点亮成长中心连登（与签到连签是两套系统）。
- **开学季**：viewed 激活 → 分享/小程序对话/专家使用/桌面 6 连判据 → 领奖 → 大转盘抽奖。

## 安装

在 magpie 的「发现」页搜索「成长计划」或「任务签到」即可安装；
或命令行：

```
magpie plugin add magpie-workbuddy-growth
```

## 账号来源

运行时从 `%USERPROFILE%\.config\magpie\plugin-auth.json` 读取
`@magpie-community/opencode-workbuddy-auth` 的登录态（国内个人账号：
无 `enterpriseId`），因此**无需重复登录**，且社区插件更新不影响本插件。

## 使用

magpie 对话里调用工具 `wb_growth`：

- `action=status`：只读盘点（任务树/能量/连登/旅行/开学季）
- `action=task`：任务树点亮+领取（`code` 指定单个任务）
- `action=travel` / `action=streak` / `action=daily`
- `action=school`（`lottery:true` 顺带抽奖；`only` 指定任务）
- `uid`：只对 uid 前缀匹配的账号执行

每日自动签到：跟随 magpie 自身的签到调度（社区插件的 `checkin` 钩子）；
`daily.mjs` 仅作手动全量补跑的备用品（`bun daily.mjs`），不挂任何定时器。

## 文件

- `growth.mjs`：成长体系全部实现（请求层/事件层/任务树/旅行/连登/开学季/签到链）
- `index.mjs`：插件入口（`wb_growth` 工具）
- `daily.mjs`：手动 CLI（可选）
