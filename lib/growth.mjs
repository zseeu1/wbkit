// growth.mjs — WorkBuddy CN 成长体系（任务树/猫猫旅行/连登/每日活跃/开学季）
// 猫猫旅行 / 任务树点亮 / 连登（补签·兑换·抽奖）/ 每日活跃 / 开学季
// 仅适用于国内个人账号（provider == "workbuddy" 且无 enterpriseId）。

import { createHash, randomUUID } from "node:crypto";

// ─── 常量（mod.rs L59-81） ────────────────────────────────────────────
export const CHAT_BASE = "https://copilot.tencent.com";
export const BILL_BASE = "https://www.codebuddy.cn";
export const WEB_BASE = "https://www.workbuddy.cn";
const GROWTH_WRITE_GAP_MS = 1200;
const REQUEST_TIMEOUT_MS = 20000;
const DESKTOP_UA = "WorkBuddy/5.5.6 WorkBuddy/5.5.6 CLI/2.137.1";
const CLI_UA = "CLI/2.63.2 CodeBuddy/2.63.2";
const WEB_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";
const MP_UA =
  "Mozilla/5.0 (Linux; Android 14; MicroMessenger/8.0.49 WeChat/0.8.0 MiniProgramEnv/android; wkbrowser xweb)";
const LIBRARY_DOC_URL = "https://www.workbuddy.cn/space/d/o0KWYeynteVv06UnAZqIFm";
const PLAYBOOK_BASE = "https://static.workbuddy.cn/workbuddy/playbook";
const ACTIVITY_ID = "school_open_day_2026";
const SCHOOL_EXPERT_CATEGORY = "16-BackToSchool";
const ACCOUNT_GAP_MS = 800;
const MAX_DRAWS = 20;
const TRAVEL_LOCATION_ID = 4;
const TRAVEL_MARKER = "first_buddy task not completed";
const NIGHT_MARKER_START = 23;
const NIGHT_MARKER_END = 8;

// COS 静态专家清单（spec.rs L209-210，值由部署脚本注入：https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/expert_center.json）
const COS_EXPERT_URL = "https://acc-1258344699.cos.accelerate.myqcloud.com/workbuddy/expert-marketplace/expert_center.json";

// spec.rs 默认回落表
const DEFAULT_SCENES = [
  ["0", "幻灯片"], ["2", "视频生成"], ["4", "深度研究"], ["6", "文档处理"],
  ["8", "数据分析"], ["10", "可视化"], ["12", "金融服务"], ["14", "产品管理"],
];
const DEFAULT_EXPERT_IDS = [
  "ContentCreator", "UiDesigner", "DataAnalyticsReporter", "ChinaEcommerceOperationsExpert",
  "DouyinStrategist", "SalesCoach", "BrandGuardian", "XiaohongshuOperationsExpert",
];
const DEFAULT_TEAM_IDS = [
  "CloudOpsTeam", "SoftwareCompany", "TradingAgentTeam", "GPTResearcherTeam", "MarketingCampaignTeam",
];
const DEFAULT_SKILL_IDS = [
  ["skill_2096525080079265792", "pptx"], ["skill_2096528888507297792", "xlsx"],
  ["skill_2070033533400236032", "qqmusic"], ["skill_2095322904487550976", "pdf"],
];
const LIGHTHOUSE_FALLBACK = [["ex_2cvvUZQhDyeJ", "腾讯轻量云专家"]];
const PE_THEME = "theme-tkmw7j";
const PE_THEME_NAME = "和平精英激战金秋";
const PLAYBOOK_FALLBACK = [["worker-ledger-freedom-dashboard", "打工人小账本"]];
const BUDDY_APP = ["cb_y5Dy46tPQGGWtueMxXbe", "企鹅教师助手"];
const SCHOOL_EXPERT_FALLBACK = [
  ["ex_jB0dyFIQJEWa", "论小舟", "论文写作导师"],
  ["ex_lQjkerakvIex", "英语学习教练", "大学英语学习教练"],
];

// ─── 工具 ────────────────────────────────────────────────────────────
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5Hex = (s) => createHash("md5").update(s, "utf8").digest("hex");
const BJ_OFFSET = 8 * 3600 * 1000;
const pad2 = (n) => String(n).padStart(2, "0");
const bjParts = (ms = Date.now()) => {
  const d = new Date(ms + BJ_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.getUTCDate(), h: d.getUTCHours() };
};
const todayKey = (ms = Date.now()) => {
  const p = bjParts(ms);
  return `${p.y}-${pad2(p.m)}-${pad2(p.day)}`;
};
const yesterdayKey = () => todayKey(Date.now() - 86400000);
const bjHourNow = () => bjParts().h;
const withinNightWindow = () => {
  const h = bjHourNow();
  return h >= NIGHT_MARKER_START || h < NIGHT_MARKER_END;
};

// derive_id(salt) = md5("{salt}:{uid}") — events.rs L141-147
const deriveId = (salt, uid) => md5Hex(`${salt}:${uid}`);

const timeoutSignal = () => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(new Error("成长任务接口请求超时")), REQUEST_TIMEOUT_MS);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

// ─── 传输层（mod.rs growth_request 语义） ─────────────────────────────
// 返回 { status, ok, code, msg, data, payload, message }
async function growthRequest(account, method, url, body, headers = {}) {
  const base = {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Bearer ${account.token || ""}`,
    "User-Agent": CLI_UA,
    Origin: BILL_BASE,
    Referer: BILL_BASE + "/",
  };
  if (account.uid) base["X-User-Id"] = account.uid;
  if (account.domain) base["X-Domain"] = account.domain;
  const final = { ...base, ...headers };
  const hasBody = body !== undefined && body !== null;
  const { signal, done } = timeoutSignal();
  let status = 0, text = "";
  try {
    const res = await fetch(url, {
      method,
      headers: final,
      body: hasBody ? JSON.stringify(body) : undefined,
      signal,
    });
    status = res.status;
    text = await res.text();
  } finally {
    done();
  }
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = {}; }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) payload = {};
  const code = typeof payload.code === "number" ? payload.code : null;
  const msg = payload.msg || payload.message || "";
  const ok = status >= 200 && status < 300 && (code === 0 || code === null);
  return { status, ok, code, msg, data: payload.data, payload, message: msg };
}

const chatCall = (a, m, p, b, h) => growthRequest(a, m, CHAT_BASE + p, b, h);
const billCall = (a, m, p, b, h) => growthRequest(a, m, BILL_BASE + p, b, h);
const webCall = (a, m, p, b, h) => growthRequest(a, m, WEB_BASE + p, b, h);
// school_request（school.rs）：growth_request + MP_UA → {CLOUD_AGENT}
const schoolCall = (a, m, p, b, h = {}) => growthRequest(a, m, BILL_BASE + p, b, { "User-Agent": MP_UA, ...h });

// ─── 任务层（mod.rs L334-444） ────────────────────────────────────────
const MP_HEADER = { "X-Client-Platform": "miniprogram" };

async function listTasks(a, mp = false) {
  const r = await chatCall(a, "GET", "/v2/activity/growth/tasks", undefined, mp ? MP_HEADER : {});
  if (!r.ok) throw new Error(`任务列表拉取失败（HTTP ${r.status} code=${r.code}）`);
  return Array.isArray(r.data?.tasks) ? r.data.tasks : [];
}
const findTask = (tasks, code) => tasks.find((t) => t.task_code === code) || null;

async function acceptTask(a, code, mp = false) {
  const r = await chatCall(a, "POST", "/v2/activity/growth/tasks/accept", { task_codes: [code] }, mp ? MP_HEADER : {});
  const status = r.data?.results?.[0]?.status ?? r.msg ?? "";
  const ok = r.ok && status === "accepted";
  return [ok, String(status)];
}

// claim → (result 0|1|2, credit, energy, msg)
async function claimTask(a, code, mp = false) {
  const h = mp ? MP_HEADER : {};
  let r = await chatCall(a, "POST", `/activity/growth/tasks/${code}/claim`, undefined, h);
  if (r.status === 400) {
    r = await webCall(a, "POST", `/activity/growth/tasks/${code}/claim`, undefined, webClaimHeaders(a));
  }
  return parseClaim(r);
}
function parseClaim(r) {
  if (!r.ok) return [0, 0, 0, `claim HTTP ${r.status} code=${r.code} msg=${r.msg}`];
  const credit = Number(r.data?.credit ?? 0) || 0;
  const energy = Number(r.data?.energy ?? 0) || 0;
  if (r.data?.already_claimed === true) return [2, credit, energy, `已领取（credit+${credit} energy+${energy}）`];
  return [1, credit, energy, `领取成功（credit+${credit} energy+${energy}）`];
}

async function energyBalance(a) {
  const r = await chatCall(a, "GET", "/v2/activity/growth/energy");
  return r.ok ? r.data?.balance : null;
}
async function growthStreakDays(a) {
  const r = await chatCall(a, "GET", "/activity/growth/streak");
  return r.ok ? (r.data?.streak?.days ?? null) : null;
}

async function adoptBuddy(a) {
  try { await reportChatSend(a, false); } catch {}
  await sleep(1500);
  await chatCall(a, "POST", "/activity/growth/buddy/agreement", { agree: true }); // 幂等，忽略结果
  await sleep(600);
  const r = await chatCall(a, "POST", "/activity/growth/buddy/first", {});
  if (r.ok) {
    const credit = Number(r.data?.credit ?? 0) || 0;
    const energy = Number(r.data?.energy ?? 0) || 0;
    return [true, `领养成功（credit+${credit} energy+${energy}）`];
  }
  if (String(r.msg || "").toLowerCase().includes("first_buddy task not completed"))
    return [false, "领养门槛未达（需先完成当日对话量），明天再试"];
  return [false, `领养失败（HTTP ${r.status} ${r.msg}）`];
}

// L780-809：accept 后回读验证（2 次）
async function acceptWithVerify(a, code, mp = false) {
  for (let i = 0; i < 2; i++) {
    if (i > 0) await sleep(GROWTH_WRITE_GAP_MS);
    const [ok] = await acceptTask(a, code, mp);
    await sleep(GROWTH_WRITE_GAP_MS);
    const tasks = await listTasks(a, mp);
    const after = findTask(tasks, code)?.accept_status ?? "";
    if (ok && after && after !== "not_accepted") return true;
  }
  return false;
}

// ─── 事件层（events.rs） ─────────────────────────────────────────────
const mpPlatformHeader = () => ({ "X-Client-Platform": "miniprogram" });

function desktopFingerprint(a, extra = {}) {
  const now = Date.now();
  return {
    timezone: "Asia/Shanghai", reportDelay: 2000, userId: a.uid,
    username: a.nick || "", userNickname: a.nick || "", product: "SaaS",
    releaseDate: 1789036585355, commit: "5f9692923c93033111c51ad7b003eb80204a9b75",
    ideName: "WorkBuddy", ideType: "WorkBuddy", ideVersion: "5.5.6",
    machineId: deriveId("machine", a.uid), sessionId: deriveId("session", a.uid),
    extName: "workbuddy-desktop", extVersion: "5.5.6",
    os: "win32", arch: "x64", osVersion: "10.0.26220", cpuCores: 20, memorySize: 24,
    timestamp: now, presentAt: now, ...extra,
  };
}
function mpDeviceFingerprint(a, extra = {}) {
  return {
    ideType: "WorkBuddy_MP", ideVersion: "2.2.8", extName: "workbuddy-mp", extVersion: "2.2.8",
    product: "SaaS", os: "android", osVersion: "14", arch: "arm64", timezone: "Asia/Shanghai",
    machineId: deriveId("machine", a.uid), ...extra,
  };
}
const desktopHeaders = (a) => ({
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json;charset=UTF-8",
  "User-Agent": DESKTOP_UA,
  "X-Domain": CHAT_BASE,
  "X-Product": "SaaS",
  "X-Request-ID": deriveId("req", a.uid) + String(Date.now() % 1000000),
  "X-User-Id": a.uid,
});
const webEventHeaders = (pageUrl) => ({
  Accept: "application/json",
  "Content-Type": "application/json",
  "x-client-platform": "web",
  Origin: WEB_BASE,
  Referer: pageUrl,
  "User-Agent": WEB_UA,
  "X-User-Id": "",
  "X-Domain": WEB_BASE,
});
const webClaimHeaders = (a) => ({
  Accept: "application/json, text/plain, */*",
  "Content-Type": "application/json",
  Origin: WEB_BASE,
  Referer: `${WEB_BASE}/profile/growth-center`,
  "x-client-platform": "web",
  "User-Agent": WEB_UA,
  "X-User-Id": a.uid,
  "X-Domain": WEB_BASE,
});
const conversation = (index) => {
  const ms = Date.now();
  const cid = `wb-run-${ms}-${index}`;
  return [cid, `${cid}-${ms}`];
};

// build_event（L147-311）—— kind → 事件对象
function buildEvent(kind, object, a, index) {
  const [cid, rid] = conversation(index);
  const now = Date.now();
  const uid = a.uid;
  switch (kind) {
    case "canvas":
      return { eventCode: "canvas_create_suc", timestamp: now, canvasId: object, canvasName: "未命名画布", source: "manually", templateId: "", conversationId: cid, requestId: rid, userId: uid };
    case "template":
      return { eventCode: "template_use", timestamp: now, templateId: object, templateName: object.meta?.name || "", source: "manually", conversationId: cid, requestId: rid, userId: uid };
    case "expert":
    case "lighthouse":
      return { eventCode: "expert_actual_use", timestamp: now, id: object.id, name: object.meta?.name || object.id, expertTitle: object.meta?.name || object.id, type: "send_message", characterCount: 12, expertType: object.meta?.expertType || "agent", conversationId: cid, requestId: rid, userId: uid };
    case "team":
      return { eventCode: "expert_actual_use", timestamp: now, id: object.id, name: object.meta?.name || object.id, expertTitle: object.meta?.name || object.id, type: "send_message", characterCount: 12, expertType: "team", conversationId: cid, requestId: rid, userId: uid };
    case "skill":
      return { eventCode: "skill_info", timestamp: now, skillId: object.id, skillName: object.meta?.name || object.id, skillVersion: "", action: "use", conversationId: cid, requestId: rid, userId: uid };
    case "automation":
      return { eventCode: "automated_task_create_suc", timestamp: now, name: "每周五自动生成周报", source: "manually", modelId: "deepseek-v4-flash", scheduleType: "recurring", schedule: { type: "recurring", rrule: "FREQ=WEEKLY;BYDAY=FR;BYHOUR=9;BYMINUTE=0" }, prompt: "每周五自动整理本周工作，生成一份周报。", pushToWeChat: false, pushToWecomBot: false, expertId: "", expertMarketplace: "", connectorIds: "", connectorCount: 0, skills: "", skillCount: 0, conversationId: cid, requestId: rid, userId: uid };
    case "playbook":
      return { eventCode: "playbook_prompt_send", timestamp: now, id: object.id, name: object.meta?.title || object.id, type: object.meta?.artifact_type || "", promptLength: 24, isOfficial: 1, skills: (object.meta?.skills || []).join(","), skillNames: (object.meta?.skills || []).join(","), expertId: object.meta?.experts?.[0]?.expert_id || object.id, expertName: object.meta?.experts?.[0]?.expert_name || "", categoryId: object.meta?.categories?.[0] || "", categoryName: "", query: "", source: "discover", ext1: "discover", conversationId: cid, requestId: rid, userId: uid };
    case "skin":
      return { eventCode: "appearance_skin_apply", timestamp: now, action: "apply", source: "settings_close", id: object.id, vipLevel: object.meta?.vipLevel || "", series: "craft", type: "unknown", name: object.meta?.name || object.id, userId: uid };
    case "chat":
    case "glmchat":
    case "cat": {
      const glm = kind === "glmchat";
      const cat = kind === "cat";
      return { eventCode: "chat_request_send", timestamp: now, mode: cat ? "night" : "craft", conversationId: cid, requestId: rid, inputLength: 12, requestModelId: glm ? "glm-5.2" : "deepseek-v4-flash", requestModelName: glm ? "GLM-5.2" : "DeepSeek V4 Flash", isPlan: false, isAutoExecuteTerminal: false, isAutoModify: false, codebaseEnable: false, maxToken: 0, maxSteps: 0, temperature: 0, maxRetries: 0, mentionContexts: [], knowledgeId: [], knowledgeName: [], codebaseId: "", mentionContextCount: 0, command: "", expertId: "", recommendId: "", skillId: "", skillCount: 0, totalCount: 0, fileUri: "", presentAt: now, traceId: "", rootRequestId: cid, parentConversationId: cid, agentName: "default", agentType: "conversation", userId: uid };
    }
    case "minichat":
      return { eventCode: "chat_request_send", timestamp: now, reportDelay: 0, source: "mini_program", ideName: "wx_app_cloud", ideType: "WorkBuddy_MP", extName: "workbuddy-mp", extVersion: "2.4.0", mode: "chat", conversationId: cid, requestId: rid, inputLength: 12, mentionContexts: [], mentionContextCount: 0, userId: uid };
    case "miniexpert":
      return mpDeviceFingerprint(a, { eventCode: "expert_actual_use", timestamp: now, source: "mini_program", ideName: "wx_app_cloud", userId: uid, id: object.id, name: object.meta?.name || object.id, expertTitle: object.meta?.name || object.id, type: "send_message", characterCount: 12, expertType: object.meta?.expertType || "agent", conversationId: cid });
    case "miniautomation":
      return mpDeviceFingerprint(a, { eventCode: "automated_task_create_suc", timestamp: now, ideName: "wx_app_cloud", userId: uid, userNickname: a.nick || "", name: "每日读书提醒", skills: "", skillCount: 0, scheduleType: "daily", source: "mini_program", mode: "CLOUD" });
    case "miniglmchat":
      return mpDeviceFingerprint(a, { eventCode: "chat_request_send", timestamp: now, source: "mini_program", ideName: "wx_app_cloud", extName: "workbuddy-mp", mode: "chat", conversationId: cid, requestId: rid, inputLength: 12, requestModelId: "glm-5.2", requestModelName: "GLM-5.2", command: "", traceId: cid, mentionContexts: [], mentionContextCount: 0, userId: uid });
    default:
      return { eventCode: kind, timestamp: now, userId: uid };
  }
}

// 桌面 6 连（L326-390）
function desktopChatSequence(a, conv, req, msg, extra = {}) {
  const now = Date.now();
  const fp = (o) => desktopFingerprint(a, { timestamp: now, presentAt: now, ...o });
  const common = { conversationId: conv, messageId: msg };
  return [
    fp({ ...common, eventCode: "agent_task_created", source: "LOCAL", name: "working", task_target: "local", mode: "craft", requestModelId: "fast-model", requestModelName: "fast-model", has_repo: false, repo_type: "none", workspace_type: "empty", has_connector: false, connector_types: [], has_mention: false, mention_types: [], has_template: false, action: "", template_name: "", has_expert: false, expert_id: "", expert_name: "", expert_industry_id: "", has_skill: false, skill_names: [], buddyId: "", buddyName: "" }),
    fp({ ...common, messageId: msg + "-assistant", eventCode: "chat_message_send", historyCount: 0, isContextTruncated: false, currentStepCount: 1, traceId: conv, rootRequestId: conv, parentConversationId: conv, agentName: "cli", agentType: "main" }),
    fp({ ...common, eventCode: "chat_request_send", requestId: req, mode: "craft", inputLength: 24, maxSteps: 500, temperature: 0, mentionContexts: [], knowledgeId: [], knowledgeName: [], codebaseId: "", mentionContextCount: 0, command: "", expertId: "", recommendId: "", skillId: "", skillCount: 0, totalCount: 0, fileUri: "", maxToken: 0, maxRetries: 0, isPlan: false, isAutoExecuteTerminal: false, isAutoModify: false, codebaseEnable: false, agentName: "cli", agentType: "main", "codebuddy.session_id": conv, "codebuddy.conversation_request_id": req }),
    fp({ ...common, messageId: msg + "-assistant", eventCode: "chat_message_response", responseModelId: "fast-model", inputToken: 120, outputToken: 80, totalToken: 200, cachedInputToken: 0, cachedOutputToken: 0, isSuccessful: true, messageErrorCode: "", finishReason: "stop", firstTokenAt: now, traceId: conv, rootRequestId: conv, parentConversationId: conv, agentName: "cli", agentType: "main", "codebuddy.session_id": conv, "codebuddy.conversation_request_id": req }),
    fp({ ...common, messageId: msg + "-assistant", eventCode: "chat_message_status", messageErrorCode: "0", traceId: conv, rootRequestId: conv, parentConversationId: conv, agentName: "cli", agentType: "main" }),
    fp({ ...common, eventCode: "chat_request_response", requestId: req, mode: "craft", toolCallCount: 0, inputToken: 120, outputToken: 80, totalToken: 200, cachedInputToken: 0, cachedOutputToken: 0, isSuccessful: true, messageErrorCode: "", finishReason: "stop", rootRequestId: conv, parentConversationId: conv, agentName: "cli", agentType: "main" }),
  ].map((e) => ({ ...e, ...extra }));
}

function desktopBuddy5Sequence(a, buddyId, buddyName) {
  const now = Date.now();
  const mk = (o) => desktopFingerprint(a, { timestamp: now, ...o });
  return [
    mk({ eventCode: "buddyapp_discover_click", mode: "LOCAL", buddyId, buddyName }),
    mk({ eventCode: "buddyapp_show", elementId: "growth_buddy", elementName: buddyName, position: 2 }),
    mk({ eventCode: "buddyapp_enter_click", elementId: "growth_buddy", elementName: buddyName, position: 2, isFirstPage: "1" }),
    mk({ eventCode: "buddyapp_auth_confirm_click", mode: "LOCAL", buddyId, buddyName }),
    mk({ eventCode: "buddyapp_bindaccount_skip_click", mode: "LOCAL", buddyId, buddyName }),
  ];
}

async function reportDesktopEvents(a, events) {
  return growthRequest(a, "POST", `${CHAT_BASE}/v2/report`, events, desktopHeaders(a));
}
async function reportRegular(a, event) {
  return billCall(a, "POST", "/v2/report", [event]);
}
const reportMpEvent = reportRegular;
async function reportWebLibrary(a) {
  const event = { eventCode: "web_element_click", timestamp: Date.now(), reportDelay: 0, pageURL: LIBRARY_DOC_URL, elementId: "library_doc_intro_click", elementName: "WorkBuddy资料库介绍", os: "Win32", arch: "", osVersion: "10.0", userAgent: WEB_UA, machineId: deriveId("webmachine", a.uid), userId: a.uid, userNickname: a.nick || "" };
  return webCall(a, "POST", "/v2/report", [event], webEventHeaders(LIBRARY_DOC_URL));
}
async function reportChatSend(a, night) {
  const event = buildEvent(night ? "cat" : "chat", null, a, 0);
  return billCall(a, "POST", "/v2/report", [event]);
}

// light_up（L430-540）
async function lightUp(a, code, kind, objects, need) {
  const now = Date.now();
  if (kind === "richmeow") {
    const rounds = Math.max(need, 1);
    for (let i = 0; i < rounds; i++) {
      const conv = `wb-run-rm-${now}-${i}`, req = `wb-run-rm-req-${now}-${i}`, msg = `req-${now}-${i}-user`;
      const r = await reportDesktopEvents(a, desktopChatSequence(a, conv, req, msg));
      if (!r.ok) return `desktop report HTTP ${r.status}`;
      if (i < rounds - 1) await sleep(GROWTH_WRITE_GAP_MS);
    }
    return null;
  }
  if (kind === "buddy5") {
    const [buddyId, buddyName] = BUDDY_APP;
    const rounds = Math.max(need, 1);
    for (let i = 0; i < rounds; i++) {
      let r = await reportDesktopEvents(a, desktopBuddy5Sequence(a, buddyId, buddyName));
      if (!r.ok) {
        const fb = desktopFingerprint(a, { eventCode: "buddyapp_enter_click", timestamp: Date.now(), reportDelay: 0, elementId: "growth_buddy", elementName: buddyName, position: 1, isFirstPage: "0", userId: a.uid });
        r = await reportDesktopEvents(a, [fb]);
        if (!r.ok) return `buddy report HTTP ${r.status}`;
      }
      if (i < rounds - 1) await sleep(GROWTH_WRITE_GAP_MS);
    }
    return null;
  }
  if (kind === "library") {
    const rounds = Math.max(need, 1);
    for (let i = 0; i < rounds; i++) {
      const r = await reportWebLibrary(a);
      if (!r.ok) return `web report HTTP ${r.status}`;
      if (i < rounds - 1) await sleep(GROWTH_WRITE_GAP_MS);
    }
    return null;
  }
  if (kind === "minichat" || kind === "miniexpert" || kind === "miniautomation" || kind === "miniglmchat") {
    const list = objects.slice(0, Math.max(need, 1));
    for (let i = 0; i < list.length; i++) {
      const ev = buildEvent(kind, list[i], a, i);
      const r = await reportMpEvent(a, ev);
      if (!r.ok) return `mp report HTTP ${r.status}`;
      if (i < list.length - 1) await sleep(GROWTH_WRITE_GAP_MS);
    }
    return null;
  }
  if (kind === "schoolseason") {
    const rounds = Math.max(need, 1);
    for (let i = 0; i < rounds; i++) {
      const ev = miniChatEvent(a, null);
      const r = await reportMpEvent(a, ev);
      if (!r.ok) return `mp report HTTP ${r.status}`;
      if (i < rounds - 1) await sleep(GROWTH_WRITE_GAP_MS);
    }
    return null;
  }
  if (kind === "buddyfirst") return null;
  const count = (!objects || objects.length === 0) ? Math.max(need, 1) : Math.min(objects.length, Math.max(need, 1));
  for (let i = 0; i < count; i++) {
    const ev = buildEvent(kind, objects[i] ?? null, a, i);
    const r = await reportRegular(a, ev);
    if (!r.ok) return `report HTTP ${r.status}`;
    if (i < count - 1) await sleep(GROWTH_WRITE_GAP_MS);
  }
  return null;
}

// ─── 任务映射（spec.rs） ─────────────────────────────────────────────
// {kind, target, needsObject, mp, unforgeable?, reason?}
const SPECS = {
  create_canvas: { kind: "canvas", target: 1, needsObject: false },
  template_5: { kind: "template", target: 5, needsObject: true, mp: true },
  expert_5: { kind: "expert", target: 5, needsObject: true, mp: false },
  Expert_team_use_3: { kind: "team", target: 3, needsObject: true },
  skill_1: { kind: "skill", target: 1, needsObject: true },
  automation_1: { kind: "automation", target: 1, needsObject: false },
  playbook_prompt: { kind: "playbook", target: 1, needsObject: true },
  Expert_lighthouse: { kind: "lighthouse", target: 1, needsObject: true },
  Hp_Appearance: { kind: "skin", target: 1, needsObject: true },
  chat_5: { kind: "chat", target: 5, needsObject: false },
  "Model_chat_GLM5.2": { kind: "glmchat", target: 1, needsObject: false },
  black_cat: { kind: "cat", target: 3, needsObject: false },
  first_buddy: { kind: "buddyfirst", target: 1, needsObject: false },
  RichMeow_Chat: { kind: "richmeow", target: 1, needsObject: false },
  Buddy_App: { kind: "buddy5", target: 1, needsObject: false },
  Buddy_App_QQ: { kind: "buddy5", target: 1, needsObject: false },
  Library_read: { kind: "library", target: 1, needsObject: false },
  Sequential_Tasks_1: { kind: "minichat", target: 1, needsObject: false, mp: true },
  Sequential_Tasks_2: { kind: "miniexpert", target: 1, needsObject: true, mp: true },
  Sequential_Tasks_3: { kind: "minichat", target: 5, needsObject: false, mp: true },
  Sequential_Tasks_4: { kind: "miniautomation", target: 1, needsObject: false, mp: true },
  Sequential_Tasks_5: { kind: "miniglmchat", target: 1, needsObject: false, mp: true },
  school_season: { kind: "schoolseason", target: 1, needsObject: false, mp: true },
  Expert_Philanthropy: { kind: "", target: 1, needsObject: false, unforgeable: true, reason: "真实捐款动作，不代做" },
};
const specOf = (code) => SPECS[code] || null;

async function sliceFor(kind, a, need, offset) {
  const uniq = (arr) => [...new Map(arr.map((x) => [x.id, x])).values()];
  const skipTake = (arr) => uniq(arr).slice(offset).slice(0, need);
  switch (kind) {
    case "canvas": {
      const ms = Date.now();
      return { objects: Array.from({ length: need }, (_, i) => ({ id: `wbx-canvas-${ms + i}`, meta: {} })), error: null };
    }
    case "template": return fetchScenes(a).then((r) => ({ objects: skipTake(r), error: r.length ? null : "scenes 为空" })).catch((e) => ({ objects: skipTake(DEFAULT_SCENES.map(([id, name]) => ({ id, meta: { name } }))), error: null }));
    case "expert": return fetchMarketExperts(a, false, "").then((r) => ({ objects: skipTake(r.length ? r : DEFAULT_EXPERT_IDS.map((id) => ({ id, meta: {} }))), error: null }));
    case "miniexpert": return fetchMarketExperts(a, false, "").then((r) => ({ objects: skipTake(r), error: null }));
    case "team": return fetchMarketExperts(a, true, "").then((r) => ({ objects: skipTake(r.length ? r : DEFAULT_TEAM_IDS.map((id) => ({ id, meta: {} }))), error: null }));
    case "lighthouse": return fetchLighthouse(a).then((r) => ({ objects: skipTake(r.length ? r : LIGHTHOUSE_FALLBACK.map(([id, name]) => ({ id, meta: { name } }))), error: null }));
    case "skill": return fetchSkills(a).then((r) => ({ objects: skipTake(r.length ? r : DEFAULT_SKILL_IDS.map(([id, name]) => ({ id, meta: { name } }))), error: null }));
    case "playbook": return fetchPlaybookCases(a).then((r) => ({ objects: skipTake(r.length ? r : PLAYBOOK_FALLBACK.map(([id, title]) => ({ id, meta: { title } }))), error: null }));
    case "skin": return fetchPeTheme(a).then((r) => ({ objects: skipTake(r.length ? r : [{ id: PE_THEME, meta: { name: PE_THEME_NAME, vipLevel: "free", series: "craft", appearance: "light" } }]), error: null }));
    default: return { objects: [], error: null }; // 无载体类
  }
}
const idsFor = (kind, a, need, offset) => sliceFor(kind, a, need, offset);

// fetch_*（spec.rs L214-374）
async function fetchScenes(a) {
  const r = await chatCall(a, "GET", "/console/as/support/scenes?locale=zh-CN");
  if (!r.ok) throw new Error("scenes HTTP " + r.status);
  return (r.data?.scenes || []).map((s) => ({ id: String(s.id), meta: { name: s.name } }));
}
async function fetchMarketExperts(a, teamOnly, keyword) {
  const out = [];
  for (let page = 1; page <= 3; page++) {
    const body = { page, page_size: 50 };
    if (keyword) body.keyword = keyword;
    const r = await chatCall(a, "POST", "/v2/operation-platform/market/expert/list", body);
    if (!r.ok) break;
    const experts = r.data?.experts || [];
    for (const e of experts) {
      if (teamOnly && e.expert_type !== "team") continue;
      out.push({ id: e.expert_id || e.source_id, meta: { name: e.display_name_zh || e.profession_zh, category: e.categories?.[0], expertType: e.expert_type, version: e.version, agent_name: e.agent_name } });
    }
    if (experts.length < 50) break;
  }
  if (out.length === 0 && !teamOnly) {
    try {
      const res = await fetch(COS_EXPERT_URL, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      const payload = await res.json();
      for (const e of payload?.data?.experts || [])
        out.push({ id: e.id, meta: { name: e.profession?.zh || e.name || e.id, category: e.categoryId, expertType: e.expertType } });
    } catch {}
  }
  return out;
}
async function fetchSkills(a) {
  const r = await chatCall(a, "POST", "/v2/operation-platform/market/skill/list", { page: 1, page_size: 8 });
  if (!r.ok) return [];
  return (r.data?.skills || []).map((s) => ({ id: s.skill_id, meta: { name: s.name } }));
}
async function fetchPlaybookCases(a) {
  try {
    const res = await fetch(`${PLAYBOOK_BASE}/registry.json`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    const payload = await res.json();
    return (payload?.cases || []).map((c) => ({ id: c.id, meta: { title: c.title, artifact_type: c.artifact_type, categories: c.categories || [], skills: c.skills || [], experts: c.experts || [], prompt: c.prompt } }));
  } catch { return []; }
}
async function fetchLighthouse(a) {
  const seen = new Map();
  for (const kw of ["lighthouse", "轻量云"]) {
    const experts = await fetchMarketExperts(a, false, kw);
    for (const e of experts) {
      const blob = `${e.id} ${e.meta?.name || ""} ${e.meta?.agent_name || ""}`.toLowerCase();
      if (["lighthouse", "轻量", "light", "yun"].some((t) => blob.includes(t)) && !seen.has(e.id)) seen.set(e.id, e);
    }
  }
  return [...seen.values()];
}
async function fetchPeTheme(a) {
  const r = await billCall(a, "POST", "/v2/operation-platform/appearance/resources", { platform: "client", kind: "theme", version: "5.5.4", lang: "zh-CN" });
  if (!r.ok) return [];
  return (r.data?.resources || [])
    .filter((it) => (it.name || "").includes("和平精英") || (it.name || "").toLowerCase().includes("pubg"))
    .map((it) => ({ id: it.id, meta: { name: it.name, vipLevel: it.vip_level, series: it.series, appearance: it.appearance } }));
}

// ─── 任务树执行（mod.rs L528-809） ───────────────────────────────────
// TaskReport {code, outcome: done|already|skipped|failed, message, credit, energy}
async function processTask(a, code, task, mp = false) {
  const rep = (outcome, message, credit = 0, energy = 0) => ({ code, outcome, message, credit, energy });
  const spec = specOf(code);
  if (!spec) return rep("skipped", "非映射任务");
  if (spec.unforgeable) return rep("skipped", `需本人操作（${spec.reason}）`);
  const cur = Number(task?.progress?.current ?? 0) || 0;
  const target = Number(task?.progress?.target ?? spec.target) || spec.target;
  const ast = task?.accept_status || "";

  if (ast === "claimed") return rep("already", `已领取（${cur}/${target}）`);
  if (task?.locked) return rep("skipped", `未到上线时间（解锁 ${task.unlock_at ?? ""}）`);
  if (cur >= target || ast === "completed")
    return claimRep(a, code, mp, rep, cur, target);
  if (spec.kind === "cat" && !withinNightWindow())
    return rep("skipped", `非夜猫窗口（23:00-08:00），当前 ${cur}/${target}`);

  if (ast === "not_accepted" || ast === "") {
    const verified = await acceptWithVerify(a, code, mp);
    if (!verified) return rep("failed", "accept 未登记生效，本轮跳过待下次");
  }

  let need = Math.max(target - cur, 0);
  if (spec.kind === "cat") need = Math.min(need, 1);
  let objects = [];
  if (need > 0) {
    const got = await idsFor(spec.kind, a, need, Math.max(cur, 0));
    if (got.error) return rep("skipped", "对象 id 获取失败");
    objects = got.objects;
    if (need > 0 && objects.length === 0 && spec.needsObject) return rep("skipped", "无可用对象 id");
  }

  const err = await lightUp(a, code, spec.kind, objects, need);
  if (err) return rep("failed", `上报失败（${err}）`);

  await sleep(1800);
  const tasks2 = await listTasks(a, mp);
  const t2 = findTask(tasks2, code);
  const ast2 = t2?.accept_status || "";
  const cur2 = Number(t2?.progress?.current ?? 0) || 0;
  const target2 = Number(t2?.progress?.target ?? target) || target;
  if (ast2 === "claimed") return rep("already", "本轮已入账");
  if (ast2 === "completed" || cur2 >= target2) return claimRep(a, code, mp, rep, cur2, target2);
  return rep("skipped", `上报未达 target（${cur2}/${target2}），待下次`);
}
async function claimRep(a, code, mp, rep, cur, target) {
  const [result, credit, energy, msg] = await claimTask(a, code, mp);
  if (result === 1) return rep("done", msg, credit, energy);
  if (result === 2) return rep("already", msg, credit, energy);
  return rep("failed", msg);
}

async function processFirstBuddy(a, code, task, mp = false) {
  const rep = (outcome, message, credit = 0, energy = 0) => ({ code, outcome, message, credit, energy });
  const cur = Number(task?.progress?.current ?? 0) || 0;
  const target = Number(task?.progress?.target ?? 1) || 1;
  const ast = task?.accept_status || "";
  if (ast === "claimed") return rep("already", `已领取（${cur}/${target}）`);
  if (ast === "completed" || cur >= target) return claimRep(a, code, mp, rep, cur, target);
  if (ast === "not_accepted" || ast === "") {
    const verified = await acceptWithVerify(a, code, mp);
    if (!verified) return rep("failed", "accept 未登记生效，本轮跳过待下次");
  }
  const [ok, msg] = await adoptBuddy(a);
  if (!ok) {
    if (msg.includes("门槛未达")) return rep("skipped", msg);
    return rep("failed", msg);
  }
  await sleep(1200);
  const out = await claimRep(a, code, mp, rep, cur, target);
  if (out.outcome === "done") out.message = `${msg}，${out.message}`;
  return out;
}

async function runTaskTree(a, only = "", mp = false) {
  const tasks = await listTasks(a, mp);
  const reports = [];
  for (const t of tasks) {
    const code = t.task_code || "";
    if (!code) continue;
    if (only && code !== only) continue;
    if (code === "first_buddy") { reports.push(await processFirstBuddy(a, code, t, mp)); continue; }
    reports.push(await processTask(a, code, t, mp));
  }
  return reports;
}

// ─── 连登（streak.rs） ───────────────────────────────────────────────
const REDEEM_PATH = "/activity/growth/redeem";
const LOTTERY_SUMMARY_PATH = "/activity/growth/lottery/summary";
const LOTTERY_DRAW_PATH = "/activity/growth/lottery/draw";
const STREAK_PATH = "/activity/growth/streak";
const HEATMAP_PATH = "/activity/growth/heatmap";
const MAKEUP_USE_PATH = "/activity/growth/makeup-cards/use";
const TIERS = ["7d", "14d", "28d"];

function parseStreakFull(data) {
  const days = data?.streak?.days ?? 0;
  const makeupCards = data?.makeup_cards?.balance ?? 0;
  const tiers = [];
  const flat = (t) => data?.redemption_status?.[`tier_${t}_status`];
  const listed = data?.redemption_status?.tiers;
  for (const t of TIERS) {
    const entry = Array.isArray(listed) ? listed.find((x) => x.tier === t) : null;
    const status = entry?.status ?? flat(t) ?? "";
    tiers.push({ tier: t, status, credit: entry?.credit ?? 0, energy: entry?.energy ?? 0, cards: entry?.cards ?? 0, chances: entry?.chances ?? 0 });
  }
  return { days, makeupCards, tiers };
}
async function streakFull(a) {
  const r = await chatCall(a, "GET", STREAK_PATH);
  if (!r.ok) throw new Error(`streak HTTP ${r.status}`);
  return parseStreakFull(r.data);
}
async function yesterdayMissed(a) {
  const r = await chatCall(a, "GET", HEATMAP_PATH);
  if (!r.ok) return false;
  const y = yesterdayKey();
  const cells = r.data?.cells || [];
  const cell = cells.find((c) => String(c.date || "").slice(0, 10) === y);
  if (!cell) return false;
  return Number(cell.score ?? 0) === 0;
}
const redeemTier = (a, tier) => chatCall(a, "POST", REDEEM_PATH, { tier, client_token: randomUUID() });
const useMakeupCard = (a, targetDate) => chatCall(a, "POST", MAKEUP_USE_PATH, { target_date: targetDate });
async function lotteryChances(a) {
  const r = await chatCall(a, "GET", LOTTERY_SUMMARY_PATH);
  return r.ok ? (r.data?.chances ?? 0) : 0;
}
async function lotteryDraw(a) {
  const r = await chatCall(a, "POST", LOTTERY_DRAW_PATH, { client_token: randomUUID() });
  return r.ok ? r.data : null;
}
const compactPrize = (p) => (typeof p === "string" ? p.slice(0, 160) : JSON.stringify(p).slice(0, 160));

// 三步互不阻断：①补签 ②兑换 ③抽奖
async function runStreakOnce(a) {
  const lines = [];
  let credit = 0;
  let missed = false, hasCards = 0;
  try { missed = await yesterdayMissed(a); } catch {}
  let full = null;
  try { full = await streakFull(a); } catch {}
  hasCards = full?.makeupCards ?? 0;
  if (missed && full) {
    if (hasCards > 0) {
      const r = await useMakeupCard(a, yesterdayKey());
      if (r.ok) lines.push("已用补签卡补回昨日");
      else lines.push(`补签失败（HTTP ${r.status} ${r.msg}）`);
    } else {
      lines.push(`昨日漏签但无补签卡（余额 ${hasCards}），连登可能中断`);
    }
  }
  if (full) {
    for (const tier of full.tiers) {
      if (tier.status !== "unlocked") continue;
      const r = await redeemTier(a, tier.tier);
      if (r.ok) {
        const c = Number(r.data?.credit ?? tier.credit ?? 0) || 0;
        credit += c;
        lines.push(`兑换 ${tier.tier}（积分+${c}）`);
      } else lines.push(`兑换 ${tier.tier} 失败（HTTP ${r.status} ${r.msg}）`);
    }
  }
  try {
    let chances = await lotteryChances(a);
    let drawn = 0;
    while (chances > 0 && drawn < MAX_DRAWS) {
      const prize = await lotteryDraw(a);
      if (!prize) { lines.push("抽奖失败，停止"); break; }
      drawn++;
      lines.push(`抽奖：${compactPrize(prize)}`);
      const left = Number(prize?.chance_balance ?? prize?.chances ?? 0) || 0;
      if (left >= chances) break; // stall 防护
      chances = left;
    }
    if (drawn > 0) lines.push(`抽奖完成 ${drawn} 次`);
  } catch {}
  return { lines, credit };
}

// ─── 猫猫旅行（travel.rs） ───────────────────────────────────────────
const adoptTried = new Map(); // uid → 北京日键
async function buddyInfo(a) {
  const r = await chatCall(a, "GET", "/activity/growth/buddy/info");
  if (!r.ok) throw new Error(`buddy info HTTP ${r.status}`);
  const b = r.data?.buddy;
  return b && typeof b === "object" && Object.keys(b).length > 0 ? b : null;
}
async function travelStatus(a) {
  const r = await chatCall(a, "GET", "/activity/growth/buddy/travel/status");
  if (!r.ok) throw new Error(`travel status HTTP ${r.status}`);
  return r.data || {};
}
const travelDepart = (a) => chatCall(a, "POST", "/activity/growth/buddy/travel/depart", { location_id: TRAVEL_LOCATION_ID });
const travelClaim = (a, recordId) => chatCall(a, "POST", "/activity/growth/buddy/travel/claim", { record_id: recordId });

// 一趟一步：无猫→领养 / arrived→领奖 / idle→派出 / traveling→跳过
async function runTravelOnce(a) {
  let info;
  try { info = await buddyInfo(a); } catch (e) { return { outcome: "failed", message: e.message }; }
  if (!info) {
    const key = todayKey();
    if (adoptTried.get(a.uid) === key) return { outcome: "skipped", message: "今日已试过领养（门槛未达）" };
    const [ok, msg] = await adoptBuddy(a);
    adoptTried.set(a.uid, key);
    if (!ok) {
      if (msg.includes("门槛未达")) return { outcome: "skipped", message: msg };
      return { outcome: "failed", message: msg };
    }
    return { outcome: "done", message: msg, credit: 300 };
  }
  let st;
  try { st = await travelStatus(a); } catch (e) { return { outcome: "failed", message: e.message }; }
  const state = st.state || "";
  if (state === "arrived") {
    const rid = Number(st.record_id ?? 0);
    if (!rid) return { outcome: "skipped", message: "旅行已到达但缺少 record_id" };
    const r = await travelClaim(a, rid);
    if (r.ok) {
      const c = Number(r.data?.reward_credit ?? st.reward_credit ?? 0) || 0;
      return { outcome: "done", message: `旅行奖励已领取（积分+${c}）`, credit: c };
    }
    return { outcome: "failed", message: `领奖失败（HTTP ${r.status} ${r.msg}）` };
  }
  if (state === "idle") {
    if (st.daily_limit_reached) return { outcome: "skipped", message: "今日旅行次数已达上限" };
    const r = await travelDepart(a);
    if (r.ok) return { outcome: "done", message: "猫猫已派出旅行（古镇客栈）" };
    return { outcome: "failed", message: `派出失败（HTTP ${r.status} ${r.msg}）` };
  }
  if (state === "traveling") return { outcome: "skipped", message: "猫猫旅行中" };
  return { outcome: "skipped", message: `未知旅行状态：${state}` };
}

// ─── 每日活跃（daily_activity.rs，点亮成长中心连登） ─────────────────
const dailySent = new Map(); // uid → 北京日键
async function reportDailyActivity(a) {
  if (!a.uid) throw new Error("缺 uid（上游会静默丢弃）");
  const key = todayKey();
  if (dailySent.get(a.uid) === key) return { sent: false, streakDays: null };
  const ev = buildEvent("chat", null, a, 0);
  const r = await billCall(a, "POST", "/v2/report", [ev]);
  if (!r.ok) throw new Error(`report HTTP ${r.status}`);
  dailySent.set(a.uid, key);
  let streakDays = null;
  try {
    const d = await growthStreakDays(a);
    if (d !== 0) streakDays = d; // 竞态读 0 不落库
  } catch {}
  return { sent: true, streakDays };
}

// ─── 开学季（school.rs） ─────────────────────────────────────────────
const schoolTaskSpec = (code) =>
  ({ task_student_verify: { mode: "manual", report_kind: "manual" }, share_invite: { mode: "share", report_kind: "share" }, chat_3_times: { mode: "mini_chat", report_kind: "mini_chat" }, desktop_chat_1_time: { mode: "desktop_seq", report_kind: "desktop_seq" }, expert_use: { mode: "expert", report_kind: "expert" } })[code] || null;

async function fetchSchoolTasks(a) {
  const r = await schoolCall(a, "GET", "/portal/activity/school/tasks");
  if (!r.ok) throw new Error(`school tasks HTTP ${r.status}`);
  return { tasks: Array.isArray(r.data?.tasks) ? r.data.tasks : [], inPeriod: r.data?.in_period === true };
}
const postViewed = (a, code) => schoolCall(a, "POST", `/portal/activity/school/tasks/${code}/viewed`, {});
const postShareComplete = (a) => schoolCall(a, "POST", "/portal/activity/school/tasks/share-complete", { channel: "wechat" });
const postSchoolClaim = (a, code) => schoolCall(a, "POST", `/portal/activity/school/tasks/${code}/claim`, {});
async function fetchLottery(a) {
  const r = await schoolCall(a, "GET", "/portal/activity/school/config");
  if (!r.ok) throw new Error(`school config HTTP ${r.status}`);
  return { config: r.data || {}, chance: r.data?.chance || {} };
}
async function postDraw(a, drawUuid) {
  const r = await schoolCall(a, "POST", "/portal/activity/school/wheel/draw", { draw_uuid: drawUuid });
  if (r.status === 409 || r.code === 40900) return { ok: false, message: "抽奖次数已用尽" };
  if (!r.ok) return { ok: false, message: `HTTP ${r.status} ${r.msg}` };
  return { ok: true, data: r.data || {} };
}
function prizeLabel(prize) {
  const code = prize?.prize_code || "";
  const amount = Number(prize?.credit_amount ?? 0) || 0;
  if (code === "school_credit_6" || code === "school_credit_66") return `${amount} 积分（+${amount} Credit）`;
  if (code === "school_voucher_luckin") return "瑞幸咖啡 15 元券";
  if (code === "kfc_ok") return "肯德基 OK 餐券";
  if (code === "kfc_ice") return "肯德基冰淇淋券";
  if (code === "kugou") return "酷狗会员月卡券";
  return code || "未知奖品";
}
function miniChatEvent(a, conv) {
  const cid = conv || `wbmp-${Date.now()}`;
  const now = Date.now();
  return { eventCode: "chat_request_send", timestamp: now, reportDelay: 0, source: "mini_program", ideName: "wx_app_cloud", ideType: "WorkBuddy_MP", extName: "workbuddy-mp", extVersion: "SaaS", mode: "chat", conversationId: cid, requestId: cid, inputLength: 12, activityId: ACTIVITY_ID, mentionContexts: [], mentionContextCount: 0, userId: a.uid };
}
async function fetchSchoolExpert(a) {
  const r = await schoolCall(a, "POST", "/v2/operation-platform/market/expert/list", { edition_mode: "all,domestic", page: 1, page_size: 20, sort_by: "use_count", sort_order: "desc", categories: [SCHOOL_EXPERT_CATEGORY], expert_type: "agent" });
  if (r.ok) {
    const e = r.data?.experts?.[0];
    if (e) return [e.expert_id, e.display_name_zh?.zh || e.display_name_zh || e.expert_id, e.profession_zh];
  }
  const fb = SCHOOL_EXPERT_FALLBACK[0];
  return [fb[0], fb[1], fb[2]];
}
function expertUseEvent(a, expertId, expertName, conv) {
  const now = Date.now();
  return mpDeviceFingerprint(a, { eventCode: "expert_actual_use", timestamp: now, reportDelay: 0, source: "mini_program", ideName: "wx_app_cloud", extName: "workbuddy-mp", extVersion: "SaaS", userId: a.uid, userNickname: a.nick || "", id: expertId, name: expertName, expertTitle: expertName, type: "send_message", characterCount: 12, expertType: "agent", conversationId: conv, activityId: ACTIVITY_ID });
}
async function reportEvents(a, events) {
  return growthRequest(a, "POST", `${BILL_BASE}/v2/report`, events, { Accept: "application/json", "Content-Type": "application/json", "User-Agent": MP_UA });
}
function desktopSeqWithActivity(a) {
  const now = Date.now();
  return desktopChatSequence(a, `wbdesk-${now}`, `wbdesk-${now}`, `wbdesk-${now}`, { activityId: ACTIVITY_ID });
}

// SchoolReport {code, outcome, message}
async function processSchoolTask(a, code, task) {
  const rep = (outcome, message) => ({ code, outcome, message });
  const spec = schoolTaskSpec(code);
  const status = String(task?.status || "").toLowerCase();
  const cur = Number(task?.progress ?? 0) || 0;
  const target = Number(task?.target_count ?? 0) || 0;
  if (status === "completed" || status === "claimed") return rep("already", `已完成/已领（${cur}/${target}）`);
  if (!spec) return rep("skipped", "未映射任务（人工/未知），跳过");
  if (spec.mode === "manual") return rep("skipped", "微信学生认证（人工环节，不碰）");
  if (status === "pending") {
    const r = await postViewed(a, code);
    if (!r.ok) return rep("failed", `viewed 激活失败：HTTP ${r.status}`);
    await sleep(GROWTH_WRITE_GAP_MS);
  }
  const rounds = spec.report_kind === "share" || spec.report_kind === "desktop_seq" ? 1 : Math.max(target - cur, 1);
  let current = cur;
  for (let i = 0; i < rounds; i++) {
    let err = null;
    try {
      if (spec.mode === "share") {
        const r = await postShareComplete(a);
        if (!r.ok) err = `share HTTP ${r.status}`;
      } else {
        let events = [];
        if (spec.report_kind === "mini_chat") events = [miniChatEvent(a, null)];
        else if (spec.report_kind === "expert") {
          const [eid, ename] = await fetchSchoolExpert(a);
          events = [expertUseEvent(a, eid, ename, `wbexp-${Date.now()}`)];
        } else if (spec.report_kind === "desktop_seq") events = desktopSeqWithActivity(a);
        if (events.length > 0) {
          const r = await reportEvents(a, events);
          if (!r.ok) err = `report HTTP ${r.status}`;
        }
      }
    } catch (e) { err = e.message; }
    if (err) return rep("failed", `判据触发失败：${err}`);
    await sleep(GROWTH_WRITE_GAP_MS);
    try {
      const { tasks } = await fetchSchoolTasks(a);
      const t2 = tasks.find((x) => x.code === code || x.task_code === code);
      if (t2) {
        const p2 = Number(t2.progress ?? 0) || 0;
        if (p2 > current) current = p2;
        const s2 = String(t2.status || "").toLowerCase();
        if (s2 === "completed" || s2 === "claimed" || p2 >= target) break;
      }
    } catch {}
  }
  try {
    const { tasks } = await fetchSchoolTasks(a);
    const t2 = tasks.find((x) => x.code === code || x.task_code === code);
    const s2 = String(t2?.status || "").toLowerCase();
    const p2 = Number(t2?.progress ?? 0) || 0;
    const tg2 = Number(t2?.target_count ?? target) || target;
    if (s2 === "claimed") return rep("already", "本轮已领取");
    if (s2 === "completed" || p2 >= tg2) {
      const r = await postSchoolClaim(a, code);
      if (r.ok) return rep("done", `已点亮并领奖（${p2}/${tg2}）`);
      return rep("failed", `已点亮但领奖失败：HTTP ${r.status}（可稍后补领）`);
    }
    return rep("skipped", `判据上报未达 target（${p2}/${tg2}）`);
  } catch (e) {
    return rep("failed", e.message);
  }
}

async function runSchoolAll(a, only = "", lottery = false) {
  let tasks, inPeriod;
  try { ({ tasks, inPeriod } = await fetchSchoolTasks(a)); }
  catch (e) { return [{ code: "(tasks)", outcome: "failed", message: e.message }]; }
  if (!inPeriod) return [{ code: "(activity)", outcome: "skipped", message: "活动非进行期（in_period=false）" }];
  const reports = [];
  for (const t of tasks) {
    const code = t.code || t.task_code || "";
    if (!code) continue;
    if (only && code !== only) continue;
    reports.push(await processSchoolTask(a, code, t));
  }
  if (lottery) {
    const lot = await runLottery(a, MAX_DRAWS);
    reports.push({ code: "(lottery)", outcome: lot.success ? "done" : "failed", message: lot.message });
  }
  return reports;
}
async function runLottery(a, max = MAX_DRAWS) {
  try {
    const { config, chance } = await fetchLottery(a);
    if (config?.in_period === false) return { success: false, drawn: 0, credit: 0, prizes: [], message: "活动非进行期，抽奖跳过" };
    let balance = Number(chance?.balance ?? 0) || 0;
    if (balance <= 0) return { success: true, drawn: 0, credit: 0, prizes: [], message: "没有可用的抽奖次数" };
    const prizes = [];
    let draws = 0, credit = 0, stall = 0, previous = balance;
    while (balance > 0 && draws < max) {
      const r = await postDraw(a, randomUUID());
      if (!r.ok) { prizes.push({ label: r.message, credit: 0 }); balance = 0; break; }
      const label = prizeLabel(r.data);
      const c = Number(r.data?.credit_amount ?? 0) || 0;
      prizes.push({ code: r.data?.prize_code || "", label, credit: c });
      credit += c;
      balance = Number(r.data?.chance_balance ?? 0) || 0;
      draws++;
      if (balance >= previous) { stall++; if (stall >= 3) break; } else stall = 0;
      previous = balance;
      if (balance > 0) await sleep(GROWTH_WRITE_GAP_MS);
    }
    return { success: true, drawn, credit, remaining: balance, prizes, message: `共抽 ${draws} 次，积分 +${credit}` };
  } catch (e) {
    return { success: false, drawn: 0, credit: 0, prizes: [], message: `抽奖中断：${e.message}` };
  }
}

// ─── 账号适配 + 门控 ─────────────────────────────────────────────────
// magpie 账号 {access, uid, domain, enterpriseId, ...} → GrowthAccount
export function growthAccountOf(site, a) {
  return { uid: a?.uid || "", nick: a?.nickname || a?.nick || "", token: a?.access || "", domain: a?.domain || "" };
}
export const supportsGrowth = (site, a) =>
  site?.id === "workbuddy" && !a?.enterpriseId && !!a?.access;

// ─── 签到主流程（billing/checkin.rs + growth.daily + streak + travel） ──
const CHECKIN_PATH = "/v2/billing/meter/daily-checkin";
function billingHeaders(a) {
  const h = { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${a.token || ""}`, "X-User-Id": a.uid || "" };
  if (a.domain) h["X-Domain"] = a.domain;
  return h;
}
// {outcome, credit, streak, message}
export async function checkinAccount(a) {
  const lines = [];
  let credit = 0;
  let outcome = "claimed";
  // 1) billing 每日签到
  let checkinMsg = "";
  try {
    const r = await growthRequest(a, "POST", CHAT_BASE + CHECKIN_PATH, {}, billingHeaders(a));
    if (r.ok) {
      const c = Number(r.data?.credit ?? r.data?.points ?? 0) || 0;
      credit += c;
      checkinMsg = `签到成功（+${c}）`;
      lines.push(checkinMsg);
    } else if ((r.status === 400 || r.status === 409) && /已签到|已领取/.test(r.msg || "")) {
      outcome = "done";
      checkinMsg = "今日已签到";
      lines.push(checkinMsg);
    } else {
      outcome = "failed";
      lines.push(`签到失败（HTTP ${r.status} code=${r.code} ${r.msg}）`);
    }
  } catch (e) {
    outcome = "failed";
    lines.push(`签到异常：${e.message}`);
  }
  // 2) 每日活跃上报（点亮成长中心连登）
  try {
    const d = await reportDailyActivity(a);
    if (d.sent) lines.push(`每日活跃已上报${d.streakDays ? `（连登 ${d.streakDays} 天）` : ""}`);
  } catch (e) { lines.push(`每日活跃失败：${e.message}`); }
  // 3) 连登（补签/兑换/抽奖）
  try {
    const s = await runStreakOnce(a);
    credit += s.credit;
    lines.push(...s.lines);
  } catch (e) { lines.push(`连登失败：${e.message}`); }
  // 4) 猫猫旅行（一趟一步）
  try {
    const t = await runTravelOnce(a);
    if (t.credit) credit += t.credit;
    lines.push(`猫猫旅行：${t.message}`);
    if (t.outcome === "failed" && outcome === "claimed") outcome = "claimed"; // 签到成功即 claimed，旅行失败只记日志
  } catch (e) { lines.push(`猫猫旅行异常：${e.message}`); }
  const message = lines.join("；");
  return { outcome, credit, message };
}

// ─── 只读盘点（admin growth.status） ─────────────────────────────────
export async function growthStatus(a) {
  const out = { uid: a.uid ? `${a.uid.slice(0, 6)}…` : "", tasks: [], energy: null, streak: null, travel: null, school: null };
  try {
    const tasks = await listTasks(a, false);
    out.tasks = tasks.map((t) => ({ code: t.task_code, status: t.accept_status || "-", current: t.progress?.current ?? 0, target: t.progress?.target ?? 0, locked: !!t.locked }));
  } catch (e) { out.tasksError = e.message; }
  try { out.energy = await energyBalance(a); } catch {}
  try { out.streak = (await streakFull(a))?.days ?? null; } catch {}
  try {
    const info = await buddyInfo(a);
    const st = await travelStatus(a);
    out.travel = { hasBuddy: !!info, state: st.state || "-", dailyLimitReached: !!st.daily_limit_reached, recordId: st.record_id ?? null };
  } catch (e) { out.travel = { error: e.message }; }
  try {
    const { tasks, inPeriod } = await fetchSchoolTasks(a);
    const { chance } = await fetchLottery(a);
    out.school = { inPeriod, tasks: tasks.map((t) => ({ code: t.code || t.task_code, status: t.status, progress: t.progress ?? 0, target: t.target_count ?? 0 })), lotteryBalance: Number(chance?.balance ?? 0) || 0 };
  } catch (e) { out.school = { error: e.message }; }
  return out;
}

// ─── magpie 接入层：捕获 getAuth + checkin 钩子 + manage_growth 工具 ──
export function createGrowth(site) {
  const auths = new Set(); // loader 捕获的 getAuth（多账号）
  const note = (getAuth) => { if (typeof getAuth === "function") auths.add(getAuth); };

  async function resolveAccounts() {
    const seen = new Map(); // uid → account
    for (const getAuth of auths) {
      try {
        const a = await getAuth();
        if (!a?.access || !supportsGrowth(site, a)) continue;
        const acct = growthAccountOf(site, a);
        if (!acct.uid || seen.has(acct.uid)) continue;
        seen.set(acct.uid, acct);
      } catch {}
    }
    return [...seen.values()];
  }

  async function checkin(getAuth) {
    const a = await getAuth();
    if (!supportsGrowth(site, a)) {
      if (site?.id !== "workbuddy") return { outcome: "inactive", message: "WorkBuddy 国际版无国内成长体系" };
      if (a?.enterpriseId) return { outcome: "inactive", message: "企业版无个人成长体系" };
      return { outcome: "inactive", message: "无有效令牌" };
    }
    return checkinAccount(growthAccountOf(site, a));
  }

  const TOOL_DEF = {
    description:
      "WorkBuddy 国内版成长中心管家：盘点/点亮成长任务树（含 RichMeow 对话链、Buddy 五连、小程序任务）、猫猫旅行（领养/派出/领奖）、连登（补签/档位兑换/抽奖）、每日活跃上报、开学季活动与抽奖。仅对国内个人账号生效。",
    args: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["status", "task", "school", "travel", "streak", "daily"], description: "status=只读盘点；task=任务树；school=开学季；travel=猫猫旅行；streak=连登；daily=每日活跃上报" },
        code: { type: "string", description: "task/school 指定单个任务 code（可选）" },
        mode: { type: "string", enum: ["full", "claim"], description: "task 模式：full=点亮+领取（默认），claim=只领取" },
        only: { type: "string", description: "school 指定任务 code（可选）" },
        lottery: { type: "boolean", description: "school 是否顺带抽奖（可选）" },
        uid: { type: "string", description: "仅对指定 uid 前 8 位匹配的账号执行（可选，默认全部国内个人账号）" },
      },
      required: ["action"],
    },
    async execute(args = {}) {
      const action = args.action || "status";
      const accounts = (await resolveAccounts()).filter((a) => !args.uid || a.uid.startsWith(args.uid));
      if (accounts.length === 0) return { output: "没有可用的 WorkBuddy 国内个人账号（需已登录且无 enterpriseId）。" };
      const blocks = [];
      for (const a of accounts) {
        const head = `账号 ${a.uid.slice(0, 8)}…`;
        try {
          if (action === "status") {
            const s = await growthStatus(a);
            blocks.push(`${head}\n` + JSON.stringify(s, null, 1));
          } else if (action === "task") {
            const reports = await runTaskTree(a, args.code || "");
            if (args.mode === "claim") {
              const lines = reports.map((r) => `${r.code}: ${r.outcome} ${r.message}`);
              blocks.push(`${head}（仅领取模式）\n` + lines.join("\n"));
            } else {
              const lines = reports.map((r) => `${r.code}: ${r.outcome} ${r.message}${r.credit ? `（+${r.credit}）` : ""}`);
              blocks.push(`${head}\n` + (lines.join("\n") || "（无任务）"));
            }
          } else if (action === "school") {
            const reports = await runSchoolAll(a, args.only || "", args.lottery === true);
            blocks.push(`${head}\n` + reports.map((r) => `${r.code}: ${r.outcome} ${r.message}`).join("\n"));
          } else if (action === "travel") {
            const r = await runTravelOnce(a);
            blocks.push(`${head} 猫猫旅行：${r.outcome} ${r.message}`);
          } else if (action === "streak") {
            const s = await runStreakOnce(a);
            blocks.push(`${head}\n` + (s.lines.join("\n") || "（无可做事项）"));
          } else if (action === "daily") {
            const d = await reportDailyActivity(a);
            blocks.push(`${head} 每日活跃：${d.sent ? "已上报" : "今日已报过"}${d.streakDays ? `（连登 ${d.streakDays} 天）` : ""}`);
          } else {
            return { output: `未知 action：${action}` };
          }
        } catch (e) {
          blocks.push(`${head} 执行失败：${e.message}`);
        }
        await sleep(ACCOUNT_GAP_MS);
      }
      return { output: blocks.join("\n\n") };
    },
  };

  return {
    note,
    checkin,
    toolBag: () => (site?.id === "workbuddy" ? { manage_growth: TOOL_DEF } : undefined),
    _internal: {
      runTaskTree, runStreakOnce, runTravelOnce, reportDailyActivity, runSchoolAll, runLottery,
      growthStatus, checkinAccount, growthAccountOf, supportsGrowth, listTasks, energyBalance, growthStreakDays,
      adoptBuddy, buddyInfo, travelStatus, CHAT_BASE, BILL_BASE, WEB_BASE,
    },
  };
}
