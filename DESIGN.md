---
name: wbkit
description: WorkBuddy 的 magpie 补位插件——多账号、签到、猫猫旅行、成长任务与用量，一页看完。
colors:
  buddy-teal: "#00c0a0"
  buddy-teal-strong: "#0a8f78"
  signal-green: "#14b877"
  alert-amber: "#e8912f"
  canvas-dark: "#101012"
  canvas-light: "#f7f9f8"
  ink-dark: "#ececee"
  ink-light: "#1b2320"
  surface-dark: "#171a1b"
  surface-light: "#ffffff"
typography:
  display:
    fontFamily: "-apple-system, \"SF Pro Text\", system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: "-0.6px"
  headline:
    fontFamily: "-apple-system, \"SF Pro Text\", system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "0.4px"
  title:
    fontFamily: "-apple-system, \"SF Pro Text\", system-ui, sans-serif"
    fontSize: "14.5px"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, \"SF Pro Text\", system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "-apple-system, \"SF Pro Text\", system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "9px"
  lg: "10px"
  xl: "16px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "14px"
  lg: "16px"
  xl: "24px"
  xxl: "26px"
components:
  button-default:
    backgroundColor: "{colors.buddy-teal}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.signal-green}"
    rounded: "{rounded.md}"
    padding: "5px 12px"
  account-card:
    backgroundColor: "{colors.surface-dark}"
    textColor: "{colors.ink-dark}"
    rounded: "{rounded.xl}"
    padding: "16px"
  status-pill:
    backgroundColor: "transparent"
    textColor: "{colors.signal-green}"
    rounded: "{rounded.pill}"
    padding: "2px 9px"
---

# Design System: wbkit

## Overview

**Creative North Star: "WorkBuddy Greenhouse"**

wbkit 是深色工作台里的一块"温室"：底色近黑、结构安静，青绿像温室里的指示灯，不只报状态，也参与品牌点缀——头像底、分区标题、进度条、按钮。信息密度依然高（这是要一眼扫完所有账号的工具），但比冷冰冰的运维台更暖、更有呼吸。

它服从 magpie 的宿主主题：所有中性色都从宿主 `--magpie-fg` / `--magpie-bg` 派生，**深色/浅色两套主题共用同一套青绿品牌色**；浅色下青绿文字改用更深的 `buddy-teal-strong` 保证对比。布局用轻边框 + 低饱和表面分层，几乎不用阴影；按钮/输入/徽标都是小尺寸、明确边界，动作靠颜色与轻微位移表达，不靠装饰。

**Key Characteristics:**
- 近黑画布 + 青绿唯一彩度：绿色既报状态，也做轻品牌
- 一切中性色由宿主主题变量派生，深浅主题自动适配
- 轻边框、低饱和表面、16px 大圆角；阴影近乎为零
- 高信息密度：账号卡/紧凑行两种密度，数字与对齐优先
- 令牌绝不进页面；视觉克制但不冷漠

## Colors

深色为默认画布，浅色由宿主切换；青绿是全系统唯一彩度来源。

### Primary
- **Buddy Teal** (`#00c0a0`)：品牌主色。用于强调、进度填充、选中态、关键按钮描边/浅填充；浅色主题下文字改用 **Buddy Teal Strong** (`#0a8f78`) 满足对比。

### Secondary
- **Signal Green** (`#14b877`)：状态绿。用于"可用"徽标、进度条末端渐变、页脚连接点；与 Buddy Teal 成对出现，形成青绿渐变。

### Tertiary
- **Alert Amber** (`#e8912f`)：告警橙。只用于"待实测 / 即将到期 / 需本人完成"等需要注意但不致命的状态。

### Neutral
- **Console Black** (`#101012`)：深色画布。
- **Paper White** (`#f7f9f8`)：浅色画布。
- **Ink Dark** (`#ececee`) / **Ink Light** (`#1b2320`)：对应主题的正文色，其余中性色从它派生。
- 表面 = `color-mix(in srgb, fg 4%, transparent)`，次级表面 8%，分割线 12%，次要文字 55%。**不要写死灰色**。

### Named Rules

**The Theme Pair Rule.** 中性色永远从宿主 `--magpie-fg/--magpie-bg` 派生；深色浅色共用一套青绿。禁止新增一套硬编码灰阶。

**The Green Means Something Rule.** 青绿可以点缀品牌，但"可用/正常"必须是 Signal Green、"需要注意"必须是 Alert Amber；颜色不能只当装饰。

## Typography

**Display / Body Font:** 系统无衬线（`-apple-system, "SF Pro Text", system-ui, sans-serif`）——跟随宿主，不引入自建字体。
**Mono Font:** 仅用于令牌/路径/日期等技术性短串（`ui-monospace, SFMono-Regular, Menlo`）。

**Character:** 一个系统字体打天下，靠字重与字号做层级；数字用等宽变体对齐。安静、精确，不抢内容。

### Hierarchy
- **Display** (700, 30px, 1.1, -0.6px)：账号卡上的余额数字，页面最大字。
- **Headline** (700, 26px)：页面标题（"账号"）。
- **Title** (650, 14.5–15px)：卡片账号名、分区标题。
- **Body** (400, 13px, 1.55)：说明、行内文本。
- **Label** (600, 11.5px)：徽标、区块小标题、时间戳；必要时用 muted 色。

### Named Rules

**The One Face Rule.** 只有系统无衬线 + 技术性 mono 两种；mono 不得拿来"装技术感"。

## Layout

- 页面纵向流动，区块间距 24–26px；卡片网格 `repeat(auto-fill, minmax(340px, 1fr))`，间距 14px。
- 账号有两种密度：**卡片**（大余额 + 积分包进度）与**紧凑行**（一行一账号，grid：账号 / 余额 / 到期 / 徽标 / 动作）。
- 控制区（签到、旅行、导入导出）是横向 flex：左侧标题+说明+账号行，右侧开关/按钮。
- 断点：**≤760px** 紧凑行塌成两列，到期/徽标/动作整行折到下面；**≤700px** 卡片改为单列。
- 内边距：卡片/控制区 16px；列表头与页脚上下 14–16px。

## Elevation & Depth

**近乎全平。** 深度靠 `color-mix` 的低饱和表面 + 1px `--line` 边框分层，不靠投影。唯一的阴影用于分段控件选中态（`0 1px 2px rgba(0,0,0,0.14)`）。Greenhouse 气质允许在 hover 时加极轻上浮/柔光，但默认态必须平；不允许硬偏移阴影或彩色光晕。

### Shadow Vocabulary
- **seg-active** (`0 1px 2px rgba(0, 0, 0, 0.14)`)：分段控件当前项的落地感。
- **hover-lift** (`0 6px 18px rgba(0,0,0,0.18)`)：仅卡片/主按钮 hover 可用，默认不显示。

### Named Rules

**The Flat-By-Default Rule.** 静止表面永远是平的；阴影只回应状态（hover/选中），不装饰层级。

## Shapes

圆角偏大、边界清楚：卡片与控制区 **16px**，按钮 **9px**，输入框与头像 **8–10px**，徽标与分段按钮 **999px 胶囊**。使用 1px 细边框（`--line`），不做粗描边或左侧色条。图标只用细线 SVG，统一 1.5px 描边。

## Components

### Buttons
- **Shape:** 9px 圆角，字号 12px，内边距 5px 12px，1px 边框。
- **Default:** 浅青绿填充（`accent 12%`）+ 青绿边框（`accent 45%`）+ 青绿偏亮文字；hover 填充加深到 22%。
- **Ghost:** 透明底 + `--line` 边框 + muted 文字；hover 文字转正文色、底变次级表面。
- **Tactile note:** Greenhouse 允许主按钮 hover 轻微上浮（`translateY(-1px)` + hover-lift），按下回落；不使用缩放或弹跳。

### Status Pills
- **Style:** 胶囊，11px，1px 边框，透明底。
- **ok:** Signal Green 文字 + green 40% 边框；**warn:** Alert Amber 文字 + amber 42% 边框；**未检测:** muted + `--line`。

### Cards / Containers
- **Corner:** 16px。**Background:** `--surface`（fg 4%）。**Border:** 1px `--line`。**Shadow:** 默认无。
- **Internal Padding:** 16px；卡片头（头像/名称/徽标）横向 flex，余额与积分包纵向排列。
- **Hover:** 可加 1px 边框提亮或极轻上浮，不加彩色光晕。

### Inputs / Fields
- **Style:** 背景 `--bg`，1px `--line` 边框，8px 圆角，12px 字号，内边距 3px 7px（数字框右对齐）。
- **Focus:** 边框转青绿（accent 45%），不发光晕。

### Segmented Control (密度/分区)
- 胶囊容器（`--surface-2` + `--line`），内部胶囊项 12.5px；选中项背景用页面底色 + seg-active 阴影，形成"按下去"的层次。

### Account Row (紧凑密度)
- 一行一账号，grid 五列；首列头像+名称+域名，余额右对齐，到期与徽标随后，最右是 签到/旅行/成长 三颗 ghost 小按钮（11px，`3px 9px`）。窄屏整行折行，按钮左对齐。

## Do's and Don'ts

### Do:
- **Do** 让所有中性色从 `--magpie-fg/--magpie-bg` 派生，深浅主题自动成立。
- **Do** 用青绿做状态和轻品牌点缀，但"可用"用 Signal Green、"注意"用 Alert Amber。
- **Do** 默认扁平：靠 1px 边框 + 低饱和表面分层；阴影只回应 hover/选中。
- **Do** 保持高信息密度：数字右对齐、等宽对齐、紧凑行可切。
- **Do** 按钮/输入用小尺寸、明确边界，hover 只做轻微明暗或 1px 上浮。

### Don't:
- **Don't** 写死灰阶或只做深色——必须同时适配浅色主题。
- **Don't** 用渐变文字、玻璃拟态、彩色光晕或硬偏移阴影。
- **Don't** 在卡片/列表上加超过 1px 的左侧色条。
- **Don't** 把绿色铺满大块背景；大面积只用近黑/纸白，青绿是信号不是底色。
- **Don't** 把令牌、access/refresh 写进任何视觉快照或截图。
