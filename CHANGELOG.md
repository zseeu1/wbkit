# 更新记录

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
