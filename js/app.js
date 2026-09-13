const $ = s => document.querySelector(s);
const LOCK_SVG = '<svg viewBox="0 0 24 24" width="46" height="46" fill="#6b7486"><path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z"/></svg><br>';
const SHIELD_SVG = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#5a6b8f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.4-3 8.5-7 10-4-1.5-7-5.6-7-10V6l7-3z"/><path d="M9.2 12.2l2 2 3.6-3.8"/></svg>';
const state = {
  role: "elder",
  pageElder: "home",
  pageKid: "khome",
  voiceOn: true,
  rate: 0.9,
  volume: 1,
  dialect: "mandarin",
  auth: false,
  authTime: null,
  depositDone: false,
  highRiskViews: 0,
  fraudHits: 0,
  transferPayee: null,
  events: [],
  cards: [],
  points: 30,
  remindersOff: false,
  chat: [],
  lastSay: "",
  booted: false,
  navCount: 0,
  repeatCount: 0,
  plan: { age: 28, incomeM: 18000, spendM: 9000, saved: 250000, dependM: 3000, pillar2: true, gap: null, tax: null, quality: null, versions: [] },
  quiz: { step: 0, right: 0, answered: null, done: false, active: false },
  memos: [],
  appointments: [],
  gifts: [],
  pendingCall: null,
  funnel: RiskModel.funnel(),
  modelCv: RiskModel.crossValidate(5),
  kidFilter: "all",
};

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
function fmtNum(d) { const s = String(d || ""); return s ? Number(s).toLocaleString("en-US") : "0"; }
function fmtAmt(d) { return "¥ " + fmtNum(d); }
const wait = ms => new Promise(r => setTimeout(r, ms));
function timeStr() { const d = new Date(); return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`; }
function page() { return state.role === "elder" ? state.pageElder : state.pageKid; }
function dz(t) {
  if (state.dialect !== "sichuan") return t;
  for (const k in SICHUAN) t = t.split(k).join(SICHUAN[k]);
  return t;
}
function logLine(kind, text) {
  const box = $("#log");
  const div = document.createElement("div");
  div.className = "li " + kind;
  div.innerHTML = `<span class="t">${timeStr()}</span>${esc(text)}`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}
let toastTimer = null;
function toast(t) {
  const el = $("#toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}
function say(text, opt = {}) {
  const shown = dz(text);
  state.lastSay = text;
  state.navCount++;
  animEq();
  logLine("voice", "[语音导航] " + shown);
  if (!state.voiceOn || state.role !== "elder") return;
  TTS.speak(shown, { rate: state.rate * (opt.slow ? 0.7 : 1), volume: state.volume });
}
function animEq() {
  const bar = $("#captionBar");
  const eq = $("#eq");
  if (!bar || !eq) return;
  clearTimeout(animEq._t);
  bar.classList.remove("idle");
  bar.classList.remove("paused");
  eq.classList.add("on");
  const est = Math.min(12000, state.lastSay.length * 260 / Math.max(0.4, state.rate));
  state.speakingUntil = Date.now() + est + 800;
  animEq._t = setTimeout(() => { eq.classList.remove("on"); bar.classList.add("idle"); }, est);
}
function pauseIndicator(on) {
  const bar = $("#captionBar");
  const eq = $("#eq");
  if (!bar || !eq) return;
  clearTimeout(animEq._t);
  if (on) { bar.classList.remove("idle"); bar.classList.add("paused"); eq.classList.remove("on"); }
  else { bar.classList.remove("paused"); bar.classList.add("idle"); }
}
function repeat() { state.repeatCount++; if (state.lastSay) say(state.lastSay); }

function addRiskEvent(ev) {
  const e = { ...ev, time: timeStr(), seen: false, status: "" };
  state.events.unshift(e);
  logLine("event", `[风险事件] ${e.title}:${e.brief}`);
  if (state.auth) {
    logLine("event", `[亲情链路] 已同步至子女端(张伟)。授权开启: ${state.authTime}`);
  } else {
    logLine("event", "[亲情链路] 长辈未开启授权,事件仅在长辈端留存,未同步子女(隐私最小化)");
  }
  if (state.role === "kid") render();
  updateTabs();
}

/* ---------------- plan helpers ---------------- */
function fmtWan(n) { return n >= 10000 ? (n / 10000).toFixed(1) + " 万" : Math.round(n) + " 元"; }
function barRow(label, val, total, bg, fmt) {
  const w = total > 0 ? Math.max(2, Math.min(100, Math.round(val / total * 100))) : 2;
  const v = fmt ? fmt(val) : String(Math.round(val));
  return `<div class="bar-row"><span class="bar-label">${label}</span><div class="bar-track"><div class="bar-fill" style="width:${w}%;background:${bg}"></div></div><span class="bar-val">${v}</span></div>`;
}
function planCalc() {
  const p = state.plan;
  const years = Math.max(1, 60 - p.age);
  const need = p.spendM * 12 * 0.7 * Math.pow(1.04, years) * 25;
  const p1 = p.incomeM * 12 * 0.35 * 25;
  const p2 = p.pillar2 ? p.incomeM * 12 * 0.08 * years * 1.35 : 0;
  const surplus = Math.max(0, (p.incomeM - p.spendM - p.dependM) * 12);
  const suggest = surplus > 0 ? Math.min(12000, Math.round(surplus * 0.15 / 100) * 100) : 0;
  const fv = p.saved * Math.pow(1.03, years) + (Math.pow(1.03, years) - 1) / 0.03 * suggest;
  const gap = Math.max(0, need - p1 - p2 - fv);
  const short = surplus > 0 ? (gap > 0 ? Math.ceil(gap / surplus) + " 年" : "已可覆盖") : "—";
  return { years, need, p1, p2, fv, suggest, surplus, gap, short };
}
function taxCalc() {
  const p = state.plan;
  const taxable = Math.max(0, p.incomeM * 12 * 0.72 - 60000);
  const b = TAX_BRACKETS.find(x => taxable <= x.max);
  return { taxable, rate: b.rate, save: Math.round(12000 * b.rate) };
}
function quizCardHtml() {
  const qz = state.quiz;
  if (qz.done) return `<div class="card"><h4>陪学反诈 · 已完成</h4><div class="banner okb" style="padding:10px;font-size:13px">共 ${QUIZ.length} 题,答对 ${qz.right} 题,+30 积分。要点已变成父亲听得懂的大白话卡片,发到他手机上了。</div></div>`;
  if (!qz.active) return `<div class="card"><h4>陪学反诈 · 和父亲一起答题</h4><p style="font-size:13px">3 道常见养老骗局判断题。答完自动攒 30 积分,并把要点转成老年通俗版卡片推送给父亲,实现“知识反哺”。</p><button class="btn small primary" style="margin-top:8px" data-act="quizStart">开始陪学</button></div>`;
  const q = QUIZ[qz.step];
  const a = qz.answered;
  return `<div class="card" style="border:2px solid #9db4d8">
    <h4>陪学反诈 第 ${qz.step + 1}/${QUIZ.length} 题<span class="pill gray">已答对 ${qz.right}</span></h4>
    <p style="font-size:14px;font-weight:700">${esc(q.q)}</p>
    ${q.a.map((opt, i) => `<button ${a !== null ? "disabled" : ""} class="${a === null ? "btn small" : (i === q.correct ? "btn small ok" : i === a ? "btn small primary" : "btn small")}" style="margin-top:8px" data-act="quizPick" data-id="${i}">${esc(opt)}</button>`).join("")}
    ${a !== null ? `<p style="font-size:12.5px;color:var(--sub);margin-top:8px;line-height:1.7">${esc(q.tip)}</p><button class="btn small primary" style="margin-top:8px" data-act="quizNext">${qz.step === QUIZ.length - 1 ? "完成陪学,发给父亲" : "下一题"}</button>` : ""}
  </div>`;
}

/* ---------------- router ---------------- */
const ELDER_TABS = [["home", "首页"], ["transfer", "转钱"], ["chat", "问问"], ["care", "我的"]];
const KID_TABS = [["khome", "首页"], ["kevents", "预警"], ["kplan", "养老规划"], ["kcare", "亲情陪护"]];

function goto(id, opts = {}) {
  if (state.role === "elder") state.pageElder = id; else state.pageKid = id;
  render();
  if (state.role === "elder" && NAV[id] && opts.announce !== false) {
    say(NAV[id].here + NAV[id].next);
  }
  if (id === "product" && !opts.quiet) {
    state.highRiskViews++;
    setTimeout(() => {
      bannerProductWarn();
      if (state.highRiskViews >= 2) {
        addRiskEvent({ title: "频繁浏览高风险金融产品", brief: "短时间内多次查看不保本的高风险养老产品", ai: "浏览行为集中且反复,存在被“高收益”吸引后冲动购买的可能。", advice: "可以聊聊“收益高一定伴随风险”,陪老人去网点让理财经理当面讲清楚产品说明书。" });
      }
    }, 1200);
  }
}

function render() {
  const p = page();
  $(".phone").classList.toggle("kid", state.role === "kid");
  $("#appbar").innerHTML = state.role === "elder"
    ? `${p === "home" ? "" : '<button class="back" data-act="goBack">← 返回</button>'}<span>长辈关爱专区</span><span class="who">张建国 · 72 岁</span>`
    : `<span>亲情陪护 · 子女端</span><span class="who">张伟 · 父亲 张建国(72岁)</span>`;
  const sc = $("#screen");
  sc.className = "screen";
  sc.innerHTML = (SCREENS[p] || (() => ""))();
  sc.scrollTop = 0;
  if (state.role === "kid" && p === "kevents") state.events.forEach(e => (e.seen = true));
  updateTabs();
  pauseIndicator(state.role === "elder" && !state.voiceOn);
  armIdleNav();
}

function updateTabs() {
  const tabs = state.role === "elder" ? ELDER_TABS : KID_TABS;
  const cur = page();
  $("#tabbar").innerHTML = tabs.map(([id, name]) => {
    let dot = "";
    if (id === "kevents") {
      const n = state.auth ? state.events.filter(e => !e.seen).length : 0;
      if (n) dot = `<span class="dot">${n}</span>`;
    }
    return `<button class="tab ${cur === id ? "on" : ""}" data-act="tab" data-id="${id}"${cur === id ? ' aria-current="page"' : ""}>${name}${dot}</button>`;
  }).join("");
}

/* 停留自动重新导航(方案书 4.1.1):长辈在当前页停留约 18 秒未操作,
   系统像导航一样"从当前界面继续"重新播报,而不是要求重走原路径 */
const IDLE_NAV_MS = 18000;
let idleNavTimer = null;
function armIdleNav() {
  clearTimeout(idleNavTimer);
  if (state.role !== "elder" || !state.voiceOn || !state.booted) return;
  idleNavTimer = setTimeout(() => {
    if (Date.now() < (state.speakingUntil || 0)) { armIdleNav(); return; }
    const nav = NAV[page()];
    if (nav) say("您在这一页停了一会儿。" + nav.here + " " + nav.next, { slow: true });
    armIdleNav();
  }, IDLE_NAV_MS);
}
document.addEventListener("click", () => { if (state.role === "elder") armIdleNav(); });

/* ---------------- elder screens ---------------- */
const SCREENS = {
  home() {
    const cards = state.cards.length
      ? `<div class="card" style="border:3px solid var(--warn)">
           <h4>孩子给您发来了贴心话</h4>
           <p style="font-size:20px">${esc(state.cards[0].title)}</p>
           <button class="btn primary" style="margin-top:12px" data-act="openCard" data-id="0">点开看 · 还能听</button>
         </div>` : "";
    const appt = state.appointments.length
      ? `<div class="card" style="border:2px solid #2f6fed">
           <h4>儿子帮您约好了网点</h4>
           <p style="font-size:17px">${esc(state.appointments[0].dt)} · ${esc(state.appointments[0].br)}</p>
           <button class="btn ok" style="font-size:20px;margin-top:8px" data-act="sayAppt">▶ 听详情</button>
         </div>` : "";
    return `
      <div class="card hero">
        <p style="font-size:18px">您的养老钱,一共约</p>
        <div class="num">35.2 万元</div>
        <button class="btn" style="margin-top:12px;color:var(--brand);font-size:27px;min-height:84px" data-act="sayAssets">听我说钱</button>
      </div>
      ${cards}${appt}
      <button class="btn ${state.depositDone ? "ok" : "primary"}" style="min-height:84px;font-size:26px" data-act="tab" data-id="deposit">${state.depositDone ? "养老钱已存好" : "存养老钱"}</button>
      <button class="btn" style="font-size:22px" data-act="tab" data-id="reminders">重要提醒</button>
      <div class="quick-call">
        <button class="qc" data-act="call" data-k="son"><span class="qc-ico">儿</span>呼叫儿子</button>
        <button class="qc" data-act="call" data-k="bank"><span class="qc-ico">银</span>银行 95588</button>
        <button class="qc" data-act="call" data-k="police"><span class="qc-ico">警</span>反诈 96110</button>
      </div>
      <p class="hr-note">花钱的动作,永远由您亲自点确认</p>`;
  },

  assets() {
    return `
      <h2 class="page-title">您的钱,大白话讲清楚</h2>
      <button class="btn primary" style="min-height:84px;font-size:26px" data-act="sayAll">把三笔钱整体念一遍</button>
      ${ASSETS.map((a, i) => `
        <div class="card">
          <h4>${esc(a.name)}<span class="pill safe">${esc(a.tag)}</span></h4>
          <p style="font-size:19px">${esc(a.plain)}</p>
          <p style="color:var(--sub);font-size:14px">${esc(a.detail)}</p>
          <button class="btn ok" style="margin-top:10px;font-size:22px" data-act="sayAsset" data-id="${i}">▶ 听这一笔</button>
        </div>`).join("")}
      <button class="btn ghost" style="font-size:18px;min-height:56px" data-act="tab" data-id="product">看看银行在卖的养老产品</button>
      <p class="hr-note">只说:保不保本、什么时候能取、有没有风险。不放走势图,不放专业词。</p>`;
  },

  deposit() {
    return `
      <h2 class="page-title">个人养老金缴存</h2>
      <div class="banner info"><b>一句话:</b>这是国家给的养老政策,每年最多存 12000 元,存进去的钱当年就能帮您少交个税,退休后再取出来用。</div>
      <div class="card">
        <p>今年还可缴存额度</p>
        <div style="font-size:28px;font-weight:800">${state.depositDone ? 0 : 12000} 元</div>
        <p style="color:var(--sub);font-size:13px">测算为模拟参考,实际以税务和银行确认为准</p>
      </div>
      ${state.depositDone
        ? `<div class="banner okb"><b>今年已经缴存完成。</b>做得好,抵税的事我帮您记着。</div>`
        : `<button class="btn ok" style="min-height:84px;font-size:26px" data-act="doDeposit">就存 12000 元</button>`}
      <button class="btn" data-act="tab" data-id="home">先不存,回到首页</button>`;
  },

  depositDone() {
    return `
      <div class="banner okb"><b>缴存成功(演示)。</b>今年存养老钱的任务完成啦,这 12000 元预计能帮您少交个税约 1200 元。</div>
      <div class="card"><p>我把这几件事放进了您的提醒:</p><p>· 明年 1 月告诉您新一年的缴存额度<br>· 您 65 岁前每年讲一次领取条件</p></div>
      <button class="btn primary" data-act="tab" data-id="home">回到首页</button>`;
  },

  product() {
    const p = HIGH_RISK_PRODUCT;
    return `
      <div id="productWarn"></div>
      <h2 class="page-title">${esc(p.name)}<span class="pill risk">高风险</span></h2>
      <div class="card">
        ${p.attrs.map(a => `<p>· ${esc(a)}</p>`).join("")}
        <p style="margin-top:8px">${esc(p.plain)}</p>
      </div>
      <div class="btn-row">
        <button class="btn" data-act="tab" data-id="assets">返回</button>
        <button class="btn ghost" data-act="buyRisk">我想购买</button>
      </div>`;
  },

  transfer() {
    const t = state.transferPayee;
    return `
      <h2 class="page-title">转钱</h2>
      <div class="step">
        <div class="step-head"><span class="step-num">1</span>收钱的人<span class="hint">点一下,选中变红</span></div>
        ${CONTACTS.map((c, i) => `<button class="btn opt ${t && t.idx === i ? "sel" : ""}" data-act="pickPayee" data-id="${i}">${esc(c.name)}<span class="rel">${c.fam ? "家人 · 熟人" : "陌生 · 没转过钱"}</span></button>`).join("")}
      </div>
      <div class="step">
        <div class="step-head"><span class="step-num">2</span>转多少钱(元)<span class="hint">按下面的大数字键</span></div>
        <div class="amt-display" id="amtDisplay">${fmtAmt(state.transferAmount)}</div>
        <div class="pad">
          ${[1,2,3,4,5,6,7,8,9].map(n => `<button data-act="pad" data-k="${n}">${n}</button>`).join("")}
          <button class="pad-fn" data-act="padClear">清空</button>
          <button data-act="pad" data-k="0">0</button>
          <button class="pad-del" data-act="pad" data-k="del">⌫</button>
        </div>
      </div>
      ${t && state.transferAmount ? `<div class="card"><p style="font-size:19px">您要转给:<b>${esc(CONTACTS[t.idx].name)}</b>(${CONTACTS[t.idx].fam ? "熟人" : "陌生收款人"})<br>金额:<b>${fmtNum(state.transferAmount)} 元</b></p></div>` : ""}
      <button class="btn primary" style="min-height:84px;font-size:26px" data-act="transferNext">下一步</button>
      <p class="hr-note">现在只是填写,钱不会转出去。点错了不要紧,点左上角「返回」重来。</p>`;
  },

  transferRisk() {
    const c = CONTACTS[state.transferPayee.idx];
    return `
      <h2 class="page-title">给您的一个小提醒</h2>
      <div class="banner warn">
        <b>这不是拦您,钱的事您说了算。</b><br>
        您要把 ${fmtNum(state.transferAmount)} 元转给「${esc(c.name)}」,这位收款人您之前没给他转过钱。
        如果对方是网上认识的、催您赶紧转的、说能返高利息的,请您先缓一缓。
      </div>
      <div class="card">
        <p>您可以:</p>
        <p>· 先给儿子张伟打个电话商量一下</p>
        <p>· 带对方的聊天记录去工行网点,请工作人员帮您看看</p>
        <p>· 拨打 96110 反诈专线咨询</p>
      </div>
      <button class="btn ok" data-act="transferAbort">先不转了,和家人说说</button>
      <button class="btn" data-act="transferGo">我了解情况,继续转账</button>`;
  },

  transferDone() {
    return `
      <div class="banner okb"><b>转账已办理(演示)。</b>请留意到账短信。</div>
      <div class="banner warn">如果您接下来觉得这笔钱不对劲:马上拨打 95588 或 110,越早越有机会止付。</div>
      ${!state.auth ? `<div class="card">
          <h4>一个可选的小建议</h4>
          <p>在「亲情守护」里由<b>您自己</b>打开开关后,再遇到这类大额陌生转账,孩子会收到提醒,能早点给您打个电话。日常查询、买了什么,孩子都看不见,您可以随时关掉。</p>
          <button class="btn ghost" style="margin-top:8px" data-act="tab" data-id="care">去看看(我自己开)</button>
        </div>` : ""}
      <button class="btn primary" data-act="tab" data-id="home">回到首页</button>`;
  },

  chat() {
    return `
      <h2 class="page-title">问问反诈小帮手</h2>
      <div class="chat-list" id="chatList">
        <div class="bubble ai">叔叔您好,我是银行的反诈小帮手。拿不准的事,原样说给我听,我帮您把把关。</div>
        ${state.chat.map(m => `<div class="bubble ${m.me ? "me" : "ai"}">${esc(m.text)}</div>`).join("")}
      </div>
      <div class="step">
        <div class="step-head"><span class="step-num">?</span>这三个最常见,点一下就问</div>
        ${["群里说投养老项目,每月返大钱,靠谱吗", "自称客服,让我把钱转到安全账户", "个人养老金,我存多少划算"].map(q => `<button class="btn opt" style="font-size:21px" data-act="chatQuick" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>
      <div class="chat-input">
        <input class="input" id="chatInput" placeholder="也可以打字问我" data-inp="chat" style="font-size:19px;min-height:60px">
        <button class="mic-btn" id="micBtn" data-act="mic" style="font-size:17px">说</button>
        <button class="btn small primary" style="flex:none;font-size:19px;padding:14px 18px" data-act="chatSend">发送</button>
      </div>
      <p class="hr-note">助手只做提示和科普,不能 100% 识别诈骗;涉钱操作仍由您自己确认。</p>`;
  },

  reminders() {
    if (state.remindersOff) {
      return `<h2 class="page-title">重要提醒</h2>
        <div class="card"><p>您已关闭全部通知。</p><button class="btn ghost" style="margin-top:8px" data-act="remOn">重新打开提醒</button></div>`;
    }
    return `
      <h2 class="page-title">重要提醒</h2>
      <div class="banner info"><b>这里只有您和家人的事,广告推销全部挡掉。</b></div>
      ${REMINDERS.map((r, i) => `
        <div class="list-item">
          <div class="head"><b style="font-size:20px">${esc(r.title)}</b><span class="pill ${r.prio === "高" ? "risk" : "gray"}">${r.prio}优先</span><span class="time">${state.depositDone && i === 0 ? "已完成" : "待办"}</span></div>
          <p style="font-size:17px">${esc(r.body)}</p>
          <button class="btn ok" style="margin-top:4px;font-size:21px" data-act="sayReminder" data-id="${i}">▶ 听这条</button>
        </div>`).join("")}
      ${state.memos.map((m, i) => `
        <div class="list-item" style="border-left:6px solid #2f6fed">
          <div class="head"><b style="font-size:20px">${esc(m.body)}</b><span class="pill">孩子记的</span><span class="time">共建备忘</span></div>
          <button class="btn ok" style="font-size:21px" data-act="sayMemo" data-id="${i}">▶ 听孩子说</button>
          <button class="btn" style="margin-top:8px;font-size:17px;min-height:54px" data-act="memoDel" data-id="${i}">不用了,删掉</button>
        </div>`).join("")}
      <button class="btn ok" style="font-size:20px" data-act="callRemind">📞 电话播报提醒(模拟 95588 来电)</button>
      <button class="btn" data-act="remOff">关闭全部通知</button>`;
  },

  care() {
    return `
      <h2 class="page-title">我的 · 都由您做主</h2>
      <div class="card toggle-row">
        <div>
          <h4>遇到风险时,提醒我儿子</h4>
          <p style="color:var(--sub);font-size:14px">只有 5 类危险才会提醒:疑似被骗、陌生大额转账、频繁看高风险产品、多次反诈提醒、账户异常。平时您查什么、买什么,孩子一律看不见。必须您本人打开,随时能关。</p>
        </div>
        <label class="switch"><input type="checkbox" ${state.auth ? "checked" : ""} data-inp="auth"><span class="slider"></span></label>
      </div>
      ${state.auth ? `<div class="banner okb"><b>已开启(${esc(state.authTime)})。</b>孩子只有“看风险提醒”的权限,不能查流水、不能动账户。</div>` : `<div class="banner info">现在没开启。不开,也不影响您用语音导航、听钱的大白话,所有功能照常。</div>`}
      <button class="btn" style="font-size:22px" data-act="tab" data-id="reminders">看重要提醒</button>
      <button class="btn ghost" style="font-size:18px;min-height:56px" data-act="mockAnomaly">演示:模拟账户异地登录预警</button>
      <div class="card">
        <h4>我的语音</h4>
        <label class="field">语速(慢一些听得清)<input type="range" min="0.5" max="1.2" step="0.05" value="${state.rate}" data-inp="rate"></label>
        <label class="field">音量<input type="range" min="0" max="1" step="0.1" value="${state.volume}" data-inp="vol"></label>
        <div class="toggle-row" style="margin-top:6px">
          <p style="font-size:15px">耳机私密播报(不在外面外放)</p>
          <label class="switch"><input type="checkbox"><span class="slider"></span></label>
        </div>
        <p style="color:var(--sub);font-size:12px;margin-top:8px">语音只帮您操作,不替您做决定;非必要不录音留存。</p>
      </div>
      <button class="btn" style="font-size:18px;min-height:56px" data-act="say" data-text="这一页的开关和设置,都由您自己定,任何人都不能替您改,包括子女。">读一读这页的说明</button>`;
  },

  cardView() {
    const c = state.cards[0];
    if (!c) return `<div class="card"><p>暂时没有孩子发来的内容。</p><button class="btn" data-act="tab" data-id="home">回到首页</button></div>`;
    return `
      <h2 class="page-title">孩子发来的大白话卡片</h2>
      <div class="card" style="border:2px solid var(--brand)">
        <h4>${esc(c.title)}<span class="pill">${esc(c.type)}</span></h4>
        <p style="font-size:18px">${esc(c.body)}</p>
        <button class="btn primary" style="margin-top:10px" data-act="say" data-text="${esc(c.say)}">听孩子说</button>
      </div>
      <button class="btn" data-act="tab" data-id="home">返回</button>`;
  },

  /* ---------------- kid screens ---------------- */
  khome() {
    const pending = state.events.filter(e => !e.status).length;
    return `
      <div class="kd-head">
        <div class="kd-avatar">父</div>
        <div style="min-width:0">
          <div class="kd-name">父亲 张建国 · 72 岁</div>
          <div class="kd-sub">${state.auth ? "亲情守护中 · " + esc(state.authTime) + " 由父亲本人开启" : "代际共享需父亲本人在长辈端开启"}</div>
        </div>
        ${state.auth ? `<span class="kd-badge"><i></i>守护中</span>` : `<span class="kd-badge off"><i></i>未开启</span>`}
      </div>
      ${!state.auth ? `<div class="card"><p>代际共享必须由<b>长辈本人</b>开启,子女不能代办;未开启不影响父亲使用全部基础功能。</p><button class="btn small ghost" style="margin-top:8px" data-act="kmockAuth">演示:模拟父亲刚刚本人开启授权</button></div>` : ""}
      <div class="kd-stats">
        <div class="kd-stat"><div class="v ${pending ? "warn" : ""}">${pending}</div><div class="l">待处理风险</div></div>
        <div class="kd-stat"><div class="v amber">${state.points}</div><div class="l">孝心积分</div></div>
        <div class="kd-stat"><div class="v blue">${state.navCount}</div><div class="l">语音服务/次</div></div>
        <div class="kd-stat"><div class="v">${state.appointments.length}</div><div class="l">网点预约/单</div></div>
      </div>
      ${pending ? `<div class="kd-alert" data-act="tab" data-id="kevents"><span class="ico">!</span><div style="min-width:0"><div class="t">有 ${pending} 条风险提醒待处理</div><div class="d">越早沟通,损失越小</div></div><span class="arr">›</span></div>`
        : `<div class="banner okb"><b>暂无待处理风险</b>,父亲账户一切正常。</div>`}
      <div class="kd-sec"><b>守护功能</b><span class="more">点图标直达对应模块</span></div>
      <div class="kd-grid">
        <button class="kd-cell" data-act="tab" data-id="kevents"><span class="ico ${pending ? "num" : ""}" data-n="${pending}" style="background:linear-gradient(150deg,#e0183a,#b3122f)">警</span><div class="t">预警中心</div><div class="d">漏斗 · 趋势</div></button>
        <button class="kd-cell" data-act="tab" data-id="kplan"><span class="ico" style="background:linear-gradient(150deg,#3063ec,#1c44c2)">规</span><div class="t">养老规划</div><div class="d">缺口 · 税优</div></button>
        <button class="kd-cell" data-act="tab" data-id="kcare"><span class="ico" style="background:linear-gradient(150deg,#17b579,#0e8a5c)">陪</span><div class="t">亲情陪护</div><div class="d">积分 · 反诈</div></button>
        <button class="kd-cell" data-act="kgo" data-page="kcare" data-anchor="kd-appt"><span class="ico" style="background:linear-gradient(150deg,#0ea5b7,#0c7a8a)">约</span><div class="t">网点预约</div><div class="d">帮父亲跑腿</div></button>
        <button class="kd-cell" data-act="kgo" data-page="kcare" data-anchor="kd-memo"><span class="ico" style="background:linear-gradient(150deg,#8b5cf6,#6d28d9)">备</span><div class="t">共建备忘</div><div class="d">${state.memos.length} 条在父亲端</div></button>
        <button class="kd-cell" data-act="kgo" data-page="kcare" data-anchor="kd-gift"><span class="ico" style="background:linear-gradient(150deg,#f59e0b,#b45309)">兑</span><div class="t">权益兑换</div><div class="d">${state.gifts.length} 单已兑</div></button>
      </div>
      <div class="kd-sec"><b>父亲的一周守护报告</b><span class="more click" data-act="tab" data-id="kevents">查看预警 ›</span></div>
      <div class="card">
        <div class="rep-list">
          <p><span>语音导航 / 重听</span><b>${state.navCount} 次 / ${state.repeatCount} 次</b></p>
          <p><span>今年个人养老金</span><b class="${state.depositDone ? "" : "bad"}">${state.depositDone ? "已缴存 12000 元" : "尚未缴存,可以提醒他"}</b></p>
          <p><span>备忘录共建 / 网点预约</span><b>${state.memos.length} 条 / ${state.appointments.length} 单</b></p>
          <p><span>定期 20 万到期</span><b>2027-08-20 · 已设双提醒</b></p>
        </div>
      </div>
      <div class="kd-sec"><b>父亲养老资产概览</b><span class="more">仅汇总 · 无流水</span></div>
      <div class="card">
        ${state.auth ? `
          <p>总额约 <b>35.2 万元</b>,以保本类为主</p>
          <p style="font-size:11.5px;color:var(--sub)">个人养老金 ${state.depositDone ? "今年已满缴" : "未缴"} · 定期 20 万 · 养老储蓄 10 万</p>`
        : `<p style="font-size:12.5px;color:var(--sub)">需父亲本人授权后查看,仅展示汇总与到期提醒;撤回授权后立即不可见。</p>`}
      </div>
      <div class="perm-note">${SHIELD_SVG}<span>权限边界:子女仅可查看风险事件与授权概览,无账户操作、无流水查询权限。</span></div>`;
  },

  kevents() {
    if (!state.auth) {
      return `<h2 class="page-title">风险预警</h2><div class="lock">${LOCK_SVG}父亲尚未开启亲情守护<br>风险预警不会同步给您<br><br>不授权不影响父亲的长辈守护全部基础功能<br>(隐私最小化,长辈随时可撤回)</div>`;
    }
    const pushed = state.events.length;
    const ai = state.funnel.first + pushed;
    const rechecked = state.funnel.passed + pushed;
    const pendingN = state.events.filter(e => !e.status).length;
    const doneN = pushed - pendingN;
    const f = state.kidFilter || "all";
    const funnel = `
      <div class="card">
        <h4>误报过滤漏斗(双重校验)</h4>
        ${barRow("AI 初筛命中", ai, ai, "linear-gradient(90deg,#8a93a6,#6b7486)")}
        ${barRow("银行风控复核通过", rechecked, ai, "linear-gradient(90deg,#f0a04b,#d97a06)")}
        ${barRow("已推送给您", pushed, ai, "linear-gradient(90deg,#e0183a,#8c0b20)")}
        ${barRow("低置信度被过滤", ai - rechecked, ai, "linear-gradient(90deg,#16b077,#0e8a5c)")}
        <p style="font-size:12px;color:var(--sub);margin-top:6px">风控模型「${RiskModel.version}」:语料 ${state.funnel.corpus} 条 · 5 折交叉验证 准确率 ${(state.modelCv.acc * 100).toFixed(1)}% · 召回率 ${(state.modelCv.rec * 100).toFixed(1)}% · F1 ${(state.modelCv.f1 * 100).toFixed(1)}%</p>
        <p style="font-size:12px;color:var(--sub)">漏斗与过滤率 ${Math.round((ai - rechecked) / ai * 100)}% 为模型对语料逐条判定的真实计算结果;低置信样本只记录、不打扰子女端。</p>
      </div>`;
    const days = ["一", "二", "三", "四", "五", "六", "日"];
    const vals = [0.18, 0.42, 0.1, 0.6, 0.26, 0, pushed > 0 ? Math.min(1, 0.34 + pushed * 0.18) : 0.06];
    const trend = `
      <div class="card">
        <h4>本周风险信号趋势</h4>
        <div class="trend">${vals.map(v => `<i style="height:${Math.max(8, v * 100)}%"></i>`).join("")}</div>
        <div class="trend-x">${days.map(d => `<span>${d}</span>`).join("")}</div>
        <p style="font-size:12px;color:var(--sub)">灰色为已过滤的低置信信号,今天 <b style="color:var(--brand)">${pushed}</b> 条高置信事件推送给您。</p>
      </div>`;
    const seg = `
      <div class="kd-seg">
        <button class="${f === "all" ? "on" : ""}" data-act="kfilter" data-f="all">全部 ${pushed}</button>
        <button class="${f === "pending" ? "on" : ""}" data-act="kfilter" data-f="pending">待处理 ${pendingN}</button>
        <button class="${f === "done" ? "on" : ""}" data-act="kfilter" data-f="done">已处理 ${doneN}</button>
      </div>
      <div class="kd-chips">
        <span class="kd-chip2">本周信号 <b>${ai}</b></span>
        <span class="kd-chip2 ok">已过滤 <b>${ai - rechecked}</b></span>
        <span class="kd-chip2 hot">待处理 <b>${pendingN}</b></span>
      </div>`;
    if (!pushed) {
      return `<h2 class="page-title">风险预警</h2>${seg}${funnel}${trend}
        <div class="banner okb"><b>目前一切正常。</b>系统只推这 5 类高危事件:疑似养老诈骗咨询 / 陌生大额转账 / 频繁浏览高风险产品 / 多次触发反诈预警 / 账户异常。</div>
        <button class="btn small ghost" data-act="kmockTransfer">演示:模拟父亲正向陌生收款人转账 8 万</button>
        <p class="hr-note">处置闭环:电话沟通 +20 积分 · 误报反馈 +10 积分,反馈回流风控模型。</p>`;
    }
    const list = state.events.filter(e => f === "all" ? true : f === "pending" ? !e.status : !!e.status);
    const empty = list.length ? "" : `<div class="banner okb" style="padding:10px;font-size:12.5px"><b>该筛选下暂无事件。</b></div>`;
    return `
      <h2 class="page-title">风险预警</h2>
      ${seg}
      ${empty}
      ${list.map((e, i) => `
        <div class="list-item" style="${e.status ? "opacity:.6" : "border-left:5px solid var(--brand)"}">
          <div class="head"><b>${esc(e.title)}</b>${e.status ? `<span class="pill gray">${esc(e.status)}</span>` : `<span class="pill risk">待处理</span>`}<span class="time">${esc(e.time)}</span></div>
          <p><b>行为简述:</b>${esc(e.brief)}</p>
          <p><b>AI 通俗解读:</b>${esc(e.ai)}</p>
          <p><b>家庭沟通建议:</b>${esc(e.advice)}</p>
          <div class="btn-row" style="margin-top:4px">
            <button class="btn small ok" data-act="kcall" data-id="${state.events.indexOf(e)}">打个电话聊聊</button>
            <button class="btn small" data-act="kfalse" data-id="${state.events.indexOf(e)}">是误报,反馈</button>
          </div>
        </div>`).join("")}
      ${funnel}${trend}
      <p class="hr-note">处置闭环:电话沟通 +20 积分 · 误报反馈 +10 积分,反馈回流风控模型。</p>`;
  },

  kplan() {
    const p = state.plan;
    const g = p.gap, t = p.tax;
    return `
      <h2 class="page-title">我的养老规划(青年规划模式)</h2>
      <div class="banner info" style="font-size:12px">纯科普、零营销:不推荐任何产品、不提供投资建议;所有结果为<b>模拟参考</b>。</div>
      <div class="card">
        <h4>基本信息</h4>
        <label class="field">年龄<input type="number" class="p-in" value="${p.age}" data-inp="pAge"></label>
        <label class="field">税前月收入(元)<input type="number" class="p-in" value="${p.incomeM}" data-inp="pInc"></label>
        <label class="field">月生活支出(元)<input type="number" class="p-in" value="${p.spendM}" data-inp="pSpd"></label>
        <label class="field">月供/赡养育儿(元)<input type="number" class="p-in" value="${p.dependM}" data-inp="pDep"></label>
        <label class="field">已有养老储备(元)<input type="number" class="p-in" value="${p.saved}" data-inp="pSav"></label>
        <div class="toggle-row"><span style="font-size:13px">有企业年金/职业年金(第二支柱)</span>
          <label class="switch"><input type="checkbox" ${p.pillar2 ? "checked" : ""} data-inp="pP2"><span class="slider"></span></label>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn primary" data-act="calcGap">缺口推演</button>
        <button class="btn ok" data-act="calcTax">税优测算</button>
      </div>
      ${g ? `
      <div class="card">
        <h4>全生命周期缺口推演(模拟参考)</h4>
        <p style="font-size:13px">${p.age} 岁 → 60 岁退休,还有 <b>${g.years}</b> 年;按当前支出 70% 替代率、4% 通胀,退休后 25 年预计共需 <b>${fmtWan(g.need)}</b></p>
        <div class="ring-wrap">
          <svg width="116" height="116" viewBox="0 0 100 100" class="ring">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#eef0f4" stroke-width="11"/>
            <circle cx="50" cy="50" r="40" fill="none" stroke="url(#ringGrad)" stroke-width="11" stroke-linecap="round"
              stroke-dasharray="251.3" stroke-dashoffset="${251.3 * (1 - (g.need > 0 ? Math.min(100, (g.p1 + g.p2 + g.fv) / g.need) : 0) / 100)}" transform="rotate(-90 50 50)" style="transition:stroke-dashoffset 1s"/>
            <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#16b077"/><stop offset="1" stop-color="#0e8a5c"/></linearGradient></defs>
            <text x="50" y="50" text-anchor="middle" class="ring-pct">${g.need > 0 ? Math.round((g.p1 + g.p2 + g.fv) / g.need * 100) : 0}%</text>
            <text x="50" y="66" text-anchor="middle" class="ring-lb">覆盖率</text>
          </svg>
          <div style="flex:1">
            ${barRow("第一支柱·基本养老保险", g.p1, g.need, "linear-gradient(90deg,#9db4d8,#6d8cc0)", fmtWan)}
            ${barRow("第二支柱·年金", g.p2, g.need, "linear-gradient(90deg,#c8b0e8,#9a76cf)", fmtWan)}
            ${barRow("第三支柱+自有储备", g.fv, g.need, "linear-gradient(90deg,#16b077,#0e8a5c)", fmtWan)}
          </div>
        </div>
        <p style="font-size:13px;margin-top:8px">仍有缺口 <b style="color:var(--brand)">${fmtWan(g.gap)}</b></p>
        <div class="banner warn" style="padding:12px;font-size:14px">建议:每年个人养老金缴存 <b>${g.suggest} 元</b>(第三支柱),按月结余 ${fmtWan(g.surplus)}/年 推演最快 <b>${g.short}</b> 补齐缺口。</div>
        <div class="rep-list" style="margin-top:10px">
          <p><span>税前月收入</span><b>${fmtNum(p.incomeM)} 元</b></p>
          <p><span>生活支出 + 月供/赡养</span><b>${fmtNum(p.spendM + p.dependM)} 元</b></p>
          <p><span>每月可结余(家庭预算约束)</span><b class="${g.surplus > 0 ? "" : "bad"}">${fmtNum(g.surplus / 12)} 元</b></p>
          <p><span>建议月缴存个人养老金</span><b>${Math.round(g.suggest / 12)} 元(年缴 ${g.suggest} 元)</b></p>
        </div>
      </div>` : ""}
      ${t ? `
      <div class="card">
        <h4>个人养老金税优测算(模拟参考)</h4>
        <p style="font-size:13px">预估全年应税所得 <b>${fmtWan(t.taxable)}</b>,适用边际税率 <b>${Math.round(t.rate * 100)}%</b></p>
        <div class="big-out">缴存满 12000 元/年,预计当年少缴个税 <b>${t.save} 元</b><br><span style="font-size:12px;color:var(--sub)">实际相当于花 ${12000 - t.save} 元锁定 12000 元养老储备</span></div>
        <p style="font-size:12px;color:var(--sub);margin-top:6px">边际税率 ≥3% 即存钱有税收收益;收入越高节税越明显。税率档位为估算,以年度汇算清缴为准。</p>
      </div>` : ""}
      <div class="card">
        <h4>品质养老 · 三支柱统筹推演(模拟参考)</h4>
        <p style="font-size:13px">养老不只是“存够钱”。选一个期望的生活方式,看看品质部分还需要多少储备:</p>
        <div class="chips" style="margin-top:6px">${QUALITY_TIERS.map((q, i) => `<button class="chip ${state.plan.quality === i ? "sel" : ""}" data-act="qualitySel" data-i="${i}">${q.label}</button>`).join("")}</div>
        ${state.plan.quality != null ? (() => {
          const q = QUALITY_TIERS[state.plan.quality];
          const years = Math.max(1, 60 - p.age);
          const extra = q.extra * 12 * Math.pow(1.04, years) * 25;
          return `<div class="big-out" style="margin-top:10px">品质增量储备需求约 <b>${fmtWan(extra)}</b>${g ? `,原缺口 ${fmtWan(g.gap)} → 总缺口约 <b>${fmtWan(g.gap + extra)}</b>` : ""}<br><span style="font-size:12px;color:var(--sub)">${q.note}</span></div>`;
        })() : `<p style="font-size:12.5px;color:var(--sub);margin-top:8px">点上方档位开始推演;结果为模拟参考,不构成投资建议。</p>`}
      </div>
      <div class="card">
        <h4>中立养老政策科普(零营销)</h4>
        ${POLICY_KB.map(k => `<div style="padding:7px 0;border-bottom:1px dashed var(--line)"><b style="font-size:13.5px">${k.t}</b><p style="font-size:12.5px;margin-top:3px">${k.d}</p></div>`).join("")}
        <p style="font-size:11.5px;color:var(--sub);margin-top:6px">政策科普不构成投资建议,以人社部与工行官方口径为准。</p>
      </div>
      <div class="step">
        <div class="step-head"><span class="step-num">↻</span>人生状态变了,方案跟着变</div>
        <div class="chips">${LIFE_EVENTS.map(ev => `<button class="chip" data-act="lifeEvent" data-k="${ev.k}">${ev.label}</button>`).join("")}</div>
      </div>
      ${p.versions.length ? `<div class="card"><h4>方案版本(动态更新)</h4>${p.versions.map(v => `<p style="font-size:13px">v${v.n} · ${esc(v.note)}</p>`).join("")}</div>` : ""}`;
  },

  kcare() {
    return `
      <h2 class="page-title">亲情陪护</h2>
      <div class="card points-bar">
        <div><p style="font-size:12px">孝心积分</p><div class="val">${state.points}</div></div>
        <p style="margin-left:auto;max-width:220px;font-size:12px">「守护—互动—激励—再守护」闭环:完成亲情动作攒积分,兑换适老权益</p>
      </div>
      <div class="kd-sec kd-anchor" id="kd-gift"><b>权益兑换</b><span class="more">${state.points} 分可用 · 适老权益</span></div>
      <div class="card">
        ${GIFTS.map(gf => `<div class="toggle-row" style="padding:6px 0">
          <div><b style="font-size:14px">${gf.name}</b> · <span style="font-size:12px;color:var(--sub)">${gf.desc}</span></div>
          <button class="btn small ${state.points >= gf.cost ? "primary" : ""}" ${state.points >= gf.cost ? "" : "disabled"} data-act="exchange" data-id="${gf.id}">${gf.cost} 分兑换</button>
        </div>`).join("")}
        ${state.gifts.length ? `<p style="font-size:12px;color:var(--ok)">已兑换:${state.gifts.map(esc).join(" · ")}</p>` : ""}
      </div>
      <div class="kd-sec kd-anchor" id="kd-quiz"><b>陪学反诈 · 和父亲一起答题</b><span class="more">答完自动 +30 分</span></div>
      ${quizCardHtml()}
      <div class="kd-sec kd-anchor" id="kd-memo"><b>家庭备忘录共建</b><span class="more">${state.auth ? "同步到父亲「重要提醒」" : "需父亲授权"}</span></div>
      <div class="card">
        <p style="font-size:12px;color:var(--sub)">您添加的备忘会出现在父亲「重要提醒」里,标着“孩子记的”,他能听也能删。</p>
        ${state.auth ? `
          <input class="input p-in-memo" id="memoInput" placeholder="例如:12月10日带爸去测血压" data-inp="memo" aria-label="备忘内容" style="margin-top:8px">
          <button class="btn small primary" style="margin-top:8px" data-act="memoAdd">添加到父亲提醒</button>
          ${state.memos.map((m, i) => `<div class="memo-row"><span>${esc(m.body)}</span><button class="btn small" data-act="memoDelK" data-id="${i}" style="min-height:44px;padding:6px 12px">撤回</button></div>`).join("")}`
        : `<p style="font-size:13px;color:var(--sub);margin-top:6px">父亲开启授权后,这里就可以和他共建备忘。</p>`}
      </div>
      <div class="kd-sec kd-anchor" id="kd-send"><b>一键转发 · 长辈看得懂版</b><span class="more">长文变白话 + 语音</span></div>
      <div class="card">
        ${KID_CARDS.map(c => {
          const sent = state.cards.some(x => x.id === c.id);
          return `<div class="send-row"><div><b style="font-size:14px">${esc(c.title)}</b><span class="pill">${esc(c.type)}</span><p style="font-size:12px;color:var(--sub)">长文已改写为 ${c.body.length} 字短句 + 语音</p></div>
            <button class="btn small ${sent ? "" : "primary"}" ${sent ? "disabled" : ""} data-act="ksend" data-id="${c.id}">${sent ? "已发送" : "发"}</button></div>`;
        }).join("")}
      </div>
      <div class="kd-sec kd-anchor" id="kd-appt"><b>网点兜底 · 帮父亲预约</b><span class="more">工单同步父亲端 + 网点后台</span></div>
      <div class="card">
        <p style="font-size:12px;color:var(--sub)">手机弄不明白的事,约到网点,柜员面对面讲;预约单父亲端和网点后台都能看到。</p>
        <select class="input p-in-sel" id="apptBranch" aria-label="选择网点">${APPT_BRANCHES.map(b => `<option>${b}</option>`).join("")}</select>
        <select class="input p-in-sel" id="apptService" style="margin-top:6px" aria-label="选择服务事项">${APPT_SERVICES.map(s => `<option>${s}</option>`).join("")}</select>
        <select class="input p-in-sel" id="apptDate" style="margin-top:6px" aria-label="选择时间">${APPT_DATES.map(d => `<option>${d}</option>`).join("")}</select>
        <button class="btn small primary" style="margin-top:8px" data-act="apptBook">生成预约工单</button>
        ${state.appointments.map(a => `<div class="memo-row"><span>${esc(a.dt)} · ${esc(a.sv)} · ${esc(a.br)}<br>工单号 ${esc(a.id)}(已同步网点后台 + 父亲端)</span></div>`).join("")}
      </div>`;
  },
};

/* ---------------- actions ---------------- */
function openModal(html) {
  const root = $("#modalRoot");
  root.innerHTML = `<div class="modal">${html}</div>`;
  root.hidden = false;
}
function closeModal() { $("#modalRoot").hidden = true; $("#modalRoot").innerHTML = ""; }

function doDepositConfirm() {
  closeModal();
  state.depositDone = true;
  logLine("good", "[业务] 长辈完成个人养老金模拟缴存 12000 元");
  goto("depositDone");
}
function doTransferFinal() {
  closeModal();
  const c = CONTACTS[state.transferPayee.idx];
  addRiskEvent({ title: "向陌生对象完成大额转账", brief: `向“${c.name}”转出 ${state.transferAmount} 元(已二次确认)`, ai: "属事前行为预警:系统只告知“发生了什么、可能是什么”,不下结论、不阻断账户。", advice: "先关心后求证:问问对方是谁、怎么认识的。如果老人支支吾吾或说“别管”,高度警惕,协助拨打 96110。" });
  goto("transferDone");
}
function doCallDone() {
  closeModal();
  state.points += 20;
  if (state.pendingCall != null && state.events[state.pendingCall]) state.events[state.pendingCall].status = "已电话沟通处置";
  state.pendingCall = null;
  logLine("good", "[亲情] 子女致电沟通并跟进处置风险(+20 孝心积分,事件闭环)");
  if (state.role === "kid") render();
  toast("沟通完成 +20 积分,事件已闭环");
}
function grantAuth() {
  closeModal();
  state.auth = true; state.authTime = timeStr();
  logLine("good", "[授权] 长辈本人开启亲情守护授权,仅同步风险事件");
  render();
  say("好嘞,开关由您自己管,随时能关。现在只有危险的事才会提醒孩子。");
  toast("已开启,随时可关闭");
}
function pushMemo(body) {
  state.memos.push({ body });
  logLine("good", `[备忘录] 子女添加共建提醒:“${body}”,已同步长辈端(长辈可删)`);
  render();
}

const ACTS = {
  goBack() {
    const back = { transferRisk: "transfer", depositDone: "deposit", product: "assets", cardView: "home", chat: "home", reminders: "home", deposit: "home", transferDone: "home" };
    const target = back[state.pageElder] || "home";
    if (target === "transfer") {
      say("这一步不影响账户,咱们回到上一页重新来。");
      goto("transfer", { announce: false });
    } else goto(target);
  },
  tab(d) { goto(d.id); },
  kgo(d) {
    goto(d.page);
    setTimeout(() => {
      const el = document.getElementById(d.anchor);
      if (el) el.scrollIntoView({ block: "start" });
    }, 80);
  },
  kfilter(d) { state.kidFilter = d.f; render(); },
  qualitySel(d) { state.plan.quality = +d.i; render(); },
  mockAnomaly() {
    addRiskEvent({ title: "账户异常访问预警", brief: "检测到非常用城市的设备登录您的手机银行(演示)", ai: "异地登录 + 新设备组合是账户被冒用的典型信号,已经银行风控规则复核后同步。", advice: "先打电话确认是不是父亲本人在操作;不是的话,马上协助改密码并拨打 95588 冻结账户。" });
    say("您的账户刚在另一个城市被登录。如果是您本人操作,就没有关系;不是的话,马上告诉我,我帮您改密码。", { slow: true });
    toast("已演示:账户异常预警");
  },
  callRemind() {
    openModal(`<h3>📞 95588 语音来电</h3><p>正在为您电话播报 ${REMINDERS.length} 条重要提醒,内容与「重要提醒」页一致;来电为低打扰兜底渠道,随时可挂断。</p><p style="color:var(--sub);font-size:13px">本演示不产生真实通话。</p><button class="btn ok" data-mact="close">知道了,挂断</button>`);
    say("您好,这里是工商银行语音提醒服务,播报您的三条重要提醒。第一条,今年存进个人养老金账户能少交个税,每年最多一万二,年底前记得办。第二条,您那笔二十万定期,明年八月二十号到期,到时候不用跑网点,手机上点一下就行。第三条,等您退休以后,养老金可以按月领,也可以一次取,有疑问打九五五八八。祝您生活愉快,再见。", { slow: true });
  },
  say(text) {},
  sayAssets() { goto("assets"); },
  sayAll() {
    say("您一共有三笔钱,总计大约三十五万二千,都以保本为主。第一笔,个人养老金账户,五万二,存钱还能少交税;第二笔,定期存款二十万,明年八月二十号到期;第三笔,养老储蓄十万,随时能取。", { slow: true });
  },
  sayAsset(d) { const a = ASSETS[+d.id]; say(a.say, { slow: true }); },
  sayReminder(d) { const r = REMINDERS[+d.id]; say(r.say, { slow: true }); },
  sayMemo(d) { const m = state.memos[+d.id]; if (m) say("孩子提醒您:" + m.body, { slow: true }); },
  memoDel(d) {
    const m = state.memos.splice(+d.id, 1)[0];
    render();
    say("好,孩子记的那条备忘已经删掉了。您的事,永远您说了算。");
    logLine("voice", "[长辈掌控] 删除子女共建备忘:" + (m ? m.body : ""));
  },
  remOff() { state.remindersOff = true; render(); say("好的,已经按您的意思把通知都关了。想重新打开,来重要提醒这一页就行。"); },
  remOn() { state.remindersOff = false; render(); say("通知重新打开了,只有关紧的事会告诉您。"); },
  doDeposit() {
    openModal(`
      <h3>确认缴存 12000 元?</h3>
      <p>这是往<b>您自己的养老金户口</b>里存钱,不是转给别人,是好事。</p>
      <p style="color:var(--sub);font-size:13px">模拟参考:预计今年少交个税约 1200 元。</p>
      <button class="btn ok" data-mact="depYes">确认,存进去</button>
      <button class="btn" data-mact="close">先不存了</button>`);
    say("确认一下:这是给您自己存养老钱,一年一万二,能少交税。想好了就点绿色的确认。");
  },
  pad(d) {
    if (d.k === "del") state.transferAmount = (state.transferAmount || "").slice(0, -1);
    else state.transferAmount = ((state.transferAmount || "") + d.k).slice(0, 9);
    const disp = $("#amtDisplay");
    if (disp) disp.textContent = fmtAmt(state.transferAmount);
  },
  padClear() {
    state.transferAmount = "";
    const disp = $("#amtDisplay");
    if (disp) disp.textContent = fmtAmt("");
    say("金额清掉了,您重新按。");
  },
  pickPayee(d) {
    state.transferPayee = { idx: +d.id };
    render();
    const c = CONTACTS[+d.id];
    say(`收款人选了,${c.name}。${c.fam ? "是熟人,放心。" : "这一位您之前没给他转过钱,请多留个心眼。"}第二步,按下面的大数字键写金额。`);
  },
  transferNext() {
    if (!state.transferPayee) { say("第一步先没做好:下面挑一个收款人,再点下一步。"); toast("请先点一个收款人"); return; }
    if (!state.transferAmount) { say("第二步:按下面红色的大数字键,写下要转多少钱,比如八万,就按八个零零零零。"); toast("请先按数字键输入金额"); return; }
    const c = CONTACTS[state.transferPayee.idx];
    const amt = parseFloat(state.transferAmount) || 0;
    if (!c.fam && amt >= 50000 || amt >= 200000) {
      goto("transferRisk");
      setTimeout(() => say(`先停一停。您要把${state.transferAmount}元,转给${c.name}。这位收款人您从来没给他转过钱。不是拦您,给您三十秒,想想对方是不是催您转、说能返高利息。`, { slow: true }), 900);
    } else {
      goto("transferDone", { announce: false });
      setTimeout(() => say(`好的,已为您转到${c.name}的账户,一共${state.transferAmount}元。点「回到首页」,咱们继续。`), 400);
    }
  },
  transferAbort() {
    goto("home", { announce: false });
    say("没得事,这一步不影响您的任何钱。和家人商量永远不丢人,想好了再来,我一直都在。");
    toast("已取消转账");
    logLine("good", "[误操作防护] 长辈在一级预警处主动停止转账");
  },
  transferGo() {
    const c = CONTACTS[state.transferPayee.idx];
    openModal(`
      <h3>最后再确认一次</h3>
      <p>转 <b>${fmtNum(state.transferAmount)} 元</b> 给「${esc(c.name)}」。</p>
      <p>钱转出去就不一定能回来了。您要不要:<br>· 现在给儿子打个电话<br>· 或者去网点请工作人员帮您核实对方</p>
      <button class="btn ok" data-mact="tAbort">算了,先不转</button>
      <button class="btn primary" data-mact="tYes">我确认,继续转账</button>
      <p class="fine">本提示为风险提示,不阻断您的自主决策</p>`);
    say(`这是最后一步确认。转${esc(state.transferAmount)}元给${esc(c.name)},请再想一想,确认没问题,再点红色的继续。`, { slow: true });
  },
  buyRisk() {
    openModal(`
      <h3>购买高风险产品,再想想</h3>
      <p>这款产品<b>不保本</b>,最坏情况会亏掉一部分本金,三年取不出来。</p>
      <p>您可以先去「亲情守护」看看要不要和孩子商量,或到网点让人当面讲说明书。</p>
      <button class="btn ok" data-mact="close">先不买,再想想</button>
      <button class="btn primary" data-mact="buyYes">我了解风险,继续(演示)</button>
      <p class="fine">本工具不推荐产品、不提供投资建议</p>`);
    say("买之前再给您提个醒:这个产品不保本,可能亏钱。想清楚了就点红色的按钮。", { slow: true });
  },
  chatSend() {
    const el = $("#chatInput");
    const text = (el.value || "").trim();
    if (text) sendChat(text);
  },
  chatQuick(d) { sendChat(d.q); },
  mic() {
    if (!STT.supported) { toast("当前浏览器不支持语音输入,可打字提问"); return; }
    const btn = $("#micBtn");
    btn.classList.add("rec");
    btn.textContent = "聆听";
    STT.start(t => {
      btn.classList.remove("rec"); btn.textContent = "说";
      $("#chatInput").value = t;
      sendChat(t);
    }, () => { btn.classList.remove("rec"); btn.textContent = "说"; });
  },
  openCard(d) { goto("cardView"); },
  call(d) {
    const map = {
      son: ["儿子 张伟", "先聊聊家常,再说那笔钱的事,老人更愿意听。"],
      bank: ["中国工商银行 95588", "人工坐席可以帮您查账、挂失、核实可疑来电。"],
      police: ["反诈专线 96110", "拿不准是不是诈骗,打这个电话,专人帮您判断。"],
    };
    const m = map[d.k];
    state.pendingCallLabel = m[0];
    openModal(`<h3>正在呼叫:${m[0]}</h3><p>已接通(演示)。</p><p style="color:var(--sub);font-size:13px">${m[1]}</p><button class="btn ok" data-mact="hangup">挂断</button>`);
    say("正在给" + m[0] + "打电话,接通了,您慢慢说。");
    logLine("voice", "[一键呼叫] " + m[0]);
  },
  sayAppt() {
    const a = state.appointments[0];
    if (!a) return;
    say(`儿子帮您约了${a.dt},去${a.br},办理${a.sv}。到时候到前台说您的名字就行,工作人员会一步步带您做。`, { slow: true });
  },
  kmockAuth() {
    state.auth = true; state.authTime = timeStr();
    logLine("good", "[授权] 长辈本人开启亲情守护授权(演示模拟)");
    render();
    toast("父亲已本人开启授权");
  },
  kmockTransfer() {
    addRiskEvent({ title: "准备发起陌生对象大额转账", brief: "向“网上认识的李女士”发起 80000 元转账,已触发二级确认", ai: "陌生收款 + 大额 + 近期浏览过养老项目内容,三项信号叠加,置信度高(银行风控二次复核通过)。", advice: "老人可能正被“高返利养老项目”话术引导。建议立刻电话沟通,别指责,先听老人讲,协助到网点核实。" });
    render();
  },
  kcall(d) {
    state.pendingCall = +d.id;
    openModal(`<h3>模拟拨打:父亲 张建国</h3><p>通话接通(演示)。</p><p style="color:var(--sub);font-size:13px">沟通小贴士:先问“今天有什么新鲜事”,别一上来就问钱;老人愿意说,再顺着聊到那笔转账。</p><button class="btn ok" data-mact="callDone">聊完了,这件事跟进处置</button><button class="btn" data-mact="close">挂断</button>`);
  },
  kfalse(d) {
    const e = state.events[+d.id];
    e.status = "已反馈疑似误报";
    state.points += 10;
    logLine("good", `[反馈闭环] 子女标记误报:“${e.title}”,样本将人工复核后回流风控模型(+10 孝心积分)`);
    render();
    toast("已反馈,持续降低误报 +10 积分");
  },
  ksend(d) { sendCard(d.id); },
  ksendTo(d) { sendCard(d.id); },
  sayText() {},
  calcGap() { state.plan.gap = planCalc(); logLine("good", "[青年规划] 完成养老缺口全生命周期推演(模拟参考)"); render(); },
  calcTax() { state.plan.tax = taxCalc(); logLine("good", "[青年规划] 完成个人养老金税优测算(模拟参考)"); render(); },
  lifeEvent(d) {
    const ev = LIFE_EVENTS.find(x => x.k === d.k);
    if (!ev) return;
    ev.apply(state.plan);
    if (state.plan.gap) state.plan.gap = planCalc();
    if (state.plan.tax) state.plan.tax = taxCalc();
    state.plan.versions.push({ n: state.plan.versions.length + 1, note: ev.label + " → " + ev.note });
    logLine("good", `[动态规划] 方案自动迭代 v${state.plan.versions.length}:${ev.label}`);
    render();
    toast("方案已按“" + ev.label + "”更新");
  },
  quizStart() { state.quiz.active = true; render(); },
  quizPick(d) {
    const qz = state.quiz;
    if (qz.answered !== null) return;
    qz.answered = +d.id;
    if (+d.id === QUIZ[qz.step].correct) qz.right++;
    render();
  },
  quizNext() {
    const qz = state.quiz;
    qz.answered = null;
    qz.step++;
    if (qz.step >= QUIZ.length) {
      qz.active = false; qz.done = true; state.points += 30;
      state.cards.unshift({
        id: "quiz",
        title: "您和孩子一起学完了反诈课",
        type: "共同学习",
        body: "三句话记住:高回报一定是骗局;安全账户一定是骗局;验证码谁要都不给。拿不准的,问银行柜台,或者问孩子。",
        say: "您和孩子刚一起学完反诈课。记住三句话:高回报一定是骗局,安全账户一定是骗局,验证码谁要都不给。拿不准就问银行,或者问孩子。",
      });
      logLine("good", `[亲情] 陪学反诈完成,答对 ${qz.right}/${QUIZ.length}(+30 孝心积分),共同学习卡片已送达长辈端`);
      toast("完成陪学 +30 积分,已发卡片给父亲");
    }
    render();
  },
  memoAdd() {
    const el = $("#memoInput");
    const body = (el.value || "").trim();
    if (!body) { toast("先写一句备忘"); return; }
    if (!state.auth) { toast("需父亲本人授权后共建"); return; }
    pushMemo(body);
    toast("已同步到父亲的「重要提醒」");
  },
  memoDelK(d) {
    state.memos.splice(+d.id, 1);
    render();
    toast("已撤回这条备忘");
  },
  apptBook() {
    const a = {
      id: "GD" + String(Date.now()).slice(-5),
      br: $("#apptBranch").value,
      sv: $("#apptService").value,
      dt: $("#apptDate").value,
    };
    state.appointments.push(a);
    logLine("good", `[多渠道兜底] 生成网点工单 ${a.id}:${a.dt} · ${a.sv} @ ${a.br},已同步网点后台与父亲端`);
    render();
    toast("预约成功,工单号 " + a.id);
  },
  exchange(d) {
    const g = GIFTS.find(x => x.id === d.id);
    if (!g || state.points < g.cost) { toast("积分不足,再攒攒"); return; }
    state.points -= g.cost;
    state.gifts.push(g.name);
    logLine("good", `[孝心积分] 兑换权益:“${g.name}”(-${g.cost} 分),已为父亲预留`);
    render();
    toast("兑换成功:" + g.name);
  },
};

function sendCard(id) {
  const c = KID_CARDS.find(x => x.id === id);
  if (!c) return;
  if (!state.cards.some(x => x.id === id)) {
    state.cards.unshift(c);
    state.points += 10;
    logLine("good", `[科普反哺] 子女转发老年通俗版卡片:“${c.title}”(+10 孝心积分)`);
    if (state.role === "kid") { render(); toast("已发送到长辈手机"); }
    else render();
    if (state.role === "elder") { say(`孩子给您发来一句贴心话:${dz(c.say)}`, { slow: true }); }
  }
}

/* ---------------- chat engine ---------------- */
function sendChat(text) {
  state.chat.push({ me: true, text });
  render();
  Engine.decide(text, state).then(d => setTimeout(() => {
    if (d.trace) d.trace.forEach(t => logLine("voice", "[编排] " + t));
    if (d.risk) {
      state.fraudHits++;
      const b = d.riskBasis || {};
      logLine("event", `[反诈] 分类器涉诈概率 ${Math.round((b.p || 0) * 100)}% · 银行风控规则复核${b.layer2 ? "命中:" + (b.ruleHits || []).join("/") : "未触发"}(第 ${state.fraudHits} 次)`);
      if (state.fraudHits === 1) {
        const ev = (d.source !== "llm" && d.riskBasis && d.riskBasis.rule)
          ? d.riskBasis.rule.event
          : {
              brief: "对话中出现模型判定的高危话术(涉诈概率 " + Math.round((b.p || 0) * 100) + "%)",
              ai: "分类器依据特征 " + (b.top || []).map(t => "「" + t.g + "」").join("") + " 判定涉诈;银行风控规则" + (b.layer2 ? "复核命中:" + (b.ruleHits || []).join("/") : "未命中,仅记录") + "。",
              advice: "先关心后求证:问问对方是谁、怎么认识的,别急着否定。拿不准就陪老人带材料去网点,或拨打 96110。",
            };
        addRiskEvent({ title: "咨询疑似诈骗信息", brief: ev.brief, ai: ev.ai, advice: ev.advice });
      } else if (state.fraudHits === 2) {
        addRiskEvent({ title: "多次触发系统反诈预警", brief: "短时间内两次触及高危诈骗话术关键词", ai: "重复咨询高危话题,被深度话术影响的可能性上升(已过银行风控二次校验)。", advice: "建议今明两天多联系老人,聊点别的,观察情绪,必要时协助下载国家反诈中心 App。" });
      }
    }
    state.chat.push({ me: false, text: d.reply });
    if (state.pageElder === "chat" && state.role === "elder") {
      render();
      $("#chatList") && ($("#chatList").scrollTop = $("#chatList").scrollHeight);
      say(d.reply, { slow: state.fraudHits > 0 });
    }
  }, 500));
}

function bannerProductWarn() {
  const wrap = $("#productWarn");
  if (!wrap) return;
  wrap.innerHTML = `<div class="banner warn"><b>温和提示,不是拦您。</b>${esc(HIGH_RISK_PRODUCT.say)}</div>`;
  say(HIGH_RISK_PRODUCT.say, { slow: true });
  logLine("event", "[一级预警] 高风险产品浏览提示已触发(未拦截浏览)");
}

/* ---------------- voice commands ---------------- */
function vfb(msg) { $("#vdHint").textContent = msg; toast(msg); }
function syncRateUI() {
  $("#rateRange").value = state.rate;
  $("#rateVal").textContent = state.rate;
  if (state.role === "elder" && state.pageElder === "care") render();
}
const CMD_RULES = [
  [/再说|重复/, () => { repeat(); vfb("好的,再说一遍"); }],
  [/暂停|别说了|安静|闭嘴/, () => { TTS.stop(); state.voiceOn = false; pauseIndicator(true); logLine("voice", "[语音命令] 已暂停播报"); vfb("已暂停,说「继续语音」恢复"); }],
  [/继续|恢复|打开语音|开声音/, () => { state.voiceOn = true; vfb("语音已恢复"); say("好的,我继续用大白话陪您。"); }],
  [/慢一?点|说慢|语速慢/, () => { state.rate = Math.max(0.5, +(state.rate - 0.15).toFixed(2)); syncRateUI(); vfb("语速已调慢"); say("好嘞,我放慢速度说。这样听得清吗?", { slow: true }); }],
  [/快一?点|语速快/, () => { state.rate = Math.min(1.2, +(state.rate + 0.15).toFixed(2)); syncRateUI(); vfb("语速已调快"); say("好,那我快一点说。"); }],
  [/大声|响一?点/, () => { state.volume = Math.min(1, +(state.volume + 0.3).toFixed(1)); vfb("音量调大了"); say("好,声音调大了。"); }],
  [/小声|轻一?点/, () => { state.volume = Math.max(0.2, +(state.volume - 0.3).toFixed(1)); vfb("音量调小了"); say("好,声音调小了。"); }],
  [/说钱|听.*钱|看.*钱|资产|余额|多少钱/, () => { goto("assets", { announce: false }); vfb("好的,给您念钱的事"); setTimeout(() => ACTS.sayAll(), 200); }],
  [/回家|首页|主页|回去/, () => { vfb("好嘞,回首页"); goto("home"); }],
  [/存|缴/, () => { vfb("打开存养老钱"); goto("deposit"); }],
  [/提醒/, () => { vfb("打开重要提醒"); goto("reminders"); }],
  [/转/, () => { vfb("打开转钱"); goto("transfer"); }],
  [/产品|理财/, () => { vfb("看看养老产品"); goto("product"); }],
  [/我的|设置|开关|授权|亲情/, () => { vfb("打开亲情守护设置"); goto("care"); }],
  [/问|反诈|骗|助手/, () => { vfb("打开反诈小帮手"); goto("chat"); }],
];
function runVoiceCommand(raw) {
  const text = (raw || "").replace(/[。，、,.!?\s]/g, "");
  if (!text) return;
  logLine("voice", `[语音命令] 听到「${raw}」`);
  $("#vdHint").textContent = "听到:「" + raw + "」";
  const rule = CMD_RULES.find(r => r[0].test(text));
  if (!rule) { vfb("没听清这项指令"); say("这个我还不会。您可以说:听我说钱、我要转钱、回家、再说一遍。"); return; }
  setTimeout(() => rule[1](), 120);
}
let cmdListening = false;
function bindVoiceCommand() {
  $("#micCmd").addEventListener("click", () => {
    if (!state.booted) { toast("请先点「开始语音导航」"); return; }
    if (!STT.supported) { toast("此浏览器不支持语音识别,请用左侧命令按钮模拟"); logLine("voice", "[语音命令] 浏览器不支持识别,改用模拟入口"); return; }
    if (cmdListening) { STT.stop(); return; }
    cmdListening = true;
    TTS.stop();
    $("#micCmd").classList.add("rec");
    $("#vdHint").textContent = "正在听您说……";
    STT.start(
      t => { $("#micCmd").classList.remove("rec"); cmdListening = false; runVoiceCommand(t); },
      () => { $("#micCmd").classList.remove("rec"); cmdListening = false; }
    );
  });
  document.querySelectorAll(".cmdbtn").forEach(b =>
    b.addEventListener("click", () => {
      if (!state.booted) { toast("请先点「开始语音导航」"); return; }
      logLine("voice", `[语音命令·模拟] 「${b.dataset.cmd}」`);
      runVoiceCommand(b.dataset.cmd);
    })
  );
}
bindVoiceCommand();

/* ---------------- input delegation ---------------- */
const INPS = {
  amt: el => { state.transferAmount = el.value.replace(/[^\d]/g, ""); },
  chat: () => {},
  memo: () => {},
  pAge: el => { state.plan.age = parseInt(el.value) || 28; },
  pInc: el => { state.plan.incomeM = parseInt(el.value) || 0; },
  pSpd: el => { state.plan.spendM = parseInt(el.value) || 0; },
  pDep: el => { state.plan.dependM = parseInt(el.value) || 0; },
  pSav: el => { state.plan.saved = parseInt(el.value) || 0; },
  pP2: el => { state.plan.pillar2 = el.checked; },
  rate: el => { state.rate = parseFloat(el.value); $("#rateRange").value = el.value; $("#rateVal").textContent = el.value; },
  vol: el => { state.volume = parseFloat(el.value); $("#volRange").value = el.value; },
  auth: el => {
    if (el.checked) {
      el.checked = false;
      openModal(`
        <h3>需要您本人确认</h3>
        <p>开启后,只有这 <b>5 类高危风险</b>会提醒儿子张伟:</p>
        <p style="font-size:13px">疑似诈骗咨询 / 陌生大额转账 / 频繁看高风险产品 / 多次反诈预警 / 账户异常</p>
        <p style="font-size:13px">您平时的查询、浏览、买什么,孩子<b>一律看不见</b>。可以随时关闭。</p>
        <button class="btn ok" data-mact="authYes">我本人同意,开启</button>
        <button class="btn" data-mact="authNo">先不开</button>`);
      say("开不开都由您。开了以后,只有危险的事才会提醒孩子,平时您干啥他看不见。");
    } else {
      state.auth = false;
      logLine("good", "[授权] 长辈随时撤回授权,亲情同步已关闭");
      toast("已按您的意思关闭");
      render();
    }
  },
};

function switchRole(r) {
  state.role = r;
  TTS.stop();
  $("#btnElder").classList.toggle("on", r === "elder");
  $("#btnKids").classList.toggle("on", r === "kid");
  pauseIndicator(false);
  render();
  if (r === "elder") goto(state.pageElder);
}

/* ---------------- global listeners ---------------- */
document.addEventListener("click", e => {
  const m = e.target.closest("[data-mact]");
  if (m) {
    const k = m.dataset.mact;
    if (k === "close") closeModal();
    else if (k === "hangup") { closeModal(); say("好的,电话挂断了。需要再打,首页随时按。"); }
    else if (k === "depYes") doDepositConfirm();
    else if (k === "tAbort") { closeModal(); ACTS.transferAbort(); }
    else if (k === "tYes") doTransferFinal();
    else if (k === "buyYes") { closeModal(); addRiskEvent({ title: "尝试购买高风险养老产品", brief: "在不保本、封闭期 3 年的产品页完成二次确认", ai: "与近期“高返利”咨询行为相互印证,风险偏好被话术拉动(已过风控复核)。", advice: "建议约老人一起去网点,听理财经理当面讲风险,再决定是否购买;别在家单独操作。" }); toast("演示:受理流程已模拟"); }
    else if (k === "callDone") doCallDone();
    else if (k === "authYes") grantAuth();
    else if (k === "authNo") { closeModal(); toast("不开也完全不影响使用"); }
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b) return;
  const act = b.dataset.act;
  if (act === "say") { say(b.dataset.text); return; }
  if (ACTS[act]) { ACTS[act](b.dataset, b); }
  else {
    say("这一步不影响您的账户,想回去可以点左上角的返回。");
  }
});

document.addEventListener("input", e => {
  const t = e.target.closest("[data-inp]");
  if (!t) return;
  INPS[t.dataset.inp] && INPS[t.dataset.inp](t);
});
document.addEventListener("change", e => {
  const t = e.target.closest('[data-inp="rate"], [data-inp="vol"]');
  if (t && state.role === "elder") {
    say(`好,${t.dataset.inp === "rate" ? `语速调成了 ${t.value},这样听得清一些。` : "声音大小调好了。"}`);
  }
});
document.addEventListener("keydown", e => {
  if (e.key === "Enter" && e.target.id === "chatInput") sendChat(e.target.value.trim());
});

$("#rateRange").addEventListener("input", e => {
  state.rate = parseFloat(e.target.value);
  $("#rateVal").textContent = e.target.value;
});
$("#volRange").addEventListener("input", e => { state.volume = parseFloat(e.target.value); });
$("#dialectSel").addEventListener("change", e => {
  state.dialect = e.target.value;
  logLine("voice", state.dialect === "sichuan" ? "[设置] 切换为川味短句播报(演示:话术改写 + 慢速)" : "[设置] 切换为普通话播报");
  say(state.dialect === "sichuan" ? "要得,那我换成川味跟您摆,听着亲切些。" : "好的,换回普通话说给您听。");
});
$("#btnRepeat").addEventListener("click", repeat);
$("#btnElder").addEventListener("click", () => switchRole("elder"));
$("#btnKids").addEventListener("click", () => switchRole("kid"));
$("#btnStart").addEventListener("click", () => {
  state.booted = true;
  $("#boot").classList.add("hide");
  logLine("voice", "[系统] 语音导航引擎启动(默认普通话,可随时暂停、重听、调语速)");
  goto("home", { announce: false });
  setTimeout(() => say("欢迎来到长辈关爱专区。" + NAV.home.here + NAV.home.next), 300);
});
render();

if (location.search.includes("shot")) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    $("#btnStart").click();
    await wait(1200);
    if (location.search.includes("paused")) { state.voiceOn = false; pauseIndicator(true); }
  })();
}


/* ---------------- auto demo ---------------- */
const AUTO = { on: false, token: 0 };
function autoStop() {
  AUTO.on = false;
  AUTO.token++;
  closeModal();
  toast("演示已停止");
  logLine("event", "[自动演示] 已停止");
}
async function autoDemo() {
  if (AUTO.on) { toast("演示正在进行中"); return; }
  AUTO.on = true;
  const my = ++AUTO.token;
  const step = async (desc, ms) => {
    if (!AUTO.on || my !== AUTO.token) return false;
    logLine("event", "[自动演示] " + desc);
    toast("演示 · " + desc);
    await wait(ms);
    return AUTO.on && my === AUTO.token;
  };
  if (!state.booted) {
    $("#btnStart").click();
    if (!await step("启动语音导航", 11000)) return;
  }
  runVoiceCommand("听我说钱");
  if (!await step("大白话讲钱(三笔一起念)", 9000)) return;
  ACTS.sayAll();
  if (!await step("整体念一遍完成", 9000)) return;
  runVoiceCommand("我要转钱");
  if (!await step("语音直达转钱页,分步引导", 8000)) return;
  ACTS.pickPayee({ id: "2" });
  if (!await step("选中“网上认识的李女士”(标着:陌生)", 3200)) return;
  for (const k of ["8", "0", "0", "0", "0"]) { ACTS.pad({ k }); await wait(260); }
  if (!await step("大数字键盘输入 80000", 1500)) return;
  ACTS.transferNext();
  if (!await step("一级温柔预警:陌生+大额,解释原因不拦人", 9000)) return;
  ACTS.transferGo();
  if (!await step("二级确认弹窗:再想一想也来得及", 8000)) return;
  doTransferFinal();
  if (!await step("产生风险事件;未授权前不外传", 7000)) return;
  goto("home");
  if (!await step("回到首页", 3500)) return;
  runVoiceCommand("问问反诈");
  if (!await step("语音直达反诈助手", 8000)) return;
  sendChat("群里说投养老项目每月返大钱稳赚");
  if (!await step("对话捕捉诈骗信号,拆解套路并记事件", 12000)) return;
  runVoiceCommand("去我的");
  if (!await step("进入我的页:亲情守护开关", 7000)) return;
  grantAuth();
  if (!await step("长辈本人开启授权(强调:只同步风险)", 5500)) return;
  switchRole("kid");
  goto("kevents");
  if (!await step("子女端:误报漏斗+趋势+2条高置信预警", 7000)) return;
  ACTS.kcall({ id: "0" });
  if (!await step("按沟通建议打电话", 3000)) return;
  doCallDone();
  if (!await step("事件闭环 +20 积分", 3000)) return;
  ACTS.kfalse({ id: "1" });
  if (!await step("疑似误报反馈回流模型 +10 积分", 3500)) return;
  goto("kplan");
  if (!await step("青年规划:自己的养老缺口", 3000)) return;
  ACTS.calcGap();
  if (!await step("缺口推演:三支柱覆盖率环形图", 5000)) return;
  ACTS.calcTax();
  if (!await step("税优测算:存1.2万省多少税", 4000)) return;
  ACTS.lifeEvent({ k: "baby" });
  if (!await step("二孩出生→方案自动迭代 v2", 4000)) return;
  goto("kcare");
  sendCard("card-fraud");
  if (!await step("一键转发:反诈知识变大白话", 3000)) return;
  pushMemo("12月10日 带爸测血压");
  if (!await step("共建备忘,同步到父亲重要提醒", 2500)) return;
  ACTS.apptBook();
  if (!await step("网点预约工单,父亲首页可见", 3500)) return;
  switchRole("elder");
  goto("home");
  if (!await step("回到长辈端:孩子的话+预约单都在", 5000)) return;
  goto("cardView");
  if (!await step("语音念出孩子的心意", 9000)) return;
  goto("home");
  if (!await step("全链路演示完成", 2000)) return;
  AUTO.on = false;
  logLine("good", "[自动演示] 全流程完成");
  toast("演示完成");
}
$("#btnAuto").addEventListener("click", autoDemo);
$("#btnAutoStop").addEventListener("click", autoStop);

/* ---------------- 引擎接线 ---------------- */
(function engineSetup() {
  const u = $("#llmUrl"), k = $("#llmKey"), a = $("#asrUrl");
  if (!u) return;
  const c = EngineConfig.get();
  if (c.llm) { u.value = c.llm.endpoint || ""; k.value = c.llm.apiKey || ""; }
  if (c.asr) a.value = c.asr.endpoint || "";
  $("#btnEngSave").addEventListener("click", () => {
    EngineConfig.set({ llm: { endpoint: u.value.trim(), apiKey: k.value.trim(), model: "glm-4-flash" }, asr: { endpoint: a.value.trim() } });
    const mode = u.value.trim() ? "大模型(LLM)" : "本地分类器";
    logLine("voice", "[引擎] 已切换:" + mode + (a.value.trim() ? " + 远程语音转写" : ""));
    toast("引擎设置已保存:" + mode);
  });
  $("#btnEngClear").addEventListener("click", () => {
    u.value = ""; k.value = ""; a.value = "";
    EngineConfig.set({});
    logLine("voice", "[引擎] 已清除,回到本地引擎");
    toast("已清除,使用本地引擎");
  });
  const cv = state.modelCv;
  Engine.probeServer().then(ok => {
    logLine(ok ? "good" : "voice", ok
      ? "[引擎] 多智能体编排服务已连接:意图路由 → 风控合规 → 金融知识 → 适老关怀"
      : `[引擎] 本地风控分类器就绪:「${RiskModel.version}」语料 ${RiskModel.corpusSize()} 条,5 折交叉验证 准确率 ${(cv.acc * 100).toFixed(1)}% / 召回率 ${(cv.rec * 100).toFixed(1)}%`);
  });
})();

if (location.search.includes("autotest")) {
  (async () => {
    try {
      await wait(300);
      autoDemo();
      let n = 0;
      while (AUTO.on && n < 1200) { await wait(500); n++; }
      document.title = "AUTOTEST done role=" + state.role + " page=" + page() + " events=" + state.events.length + " auth=" + state.auth + " cards=" + state.cards.length + " memos=" + state.memos.length + " appt=" + state.appointments.length + " versions=" + state.plan.versions.length;
    } catch (e) { document.title = "AUTOTEST ERR " + e.message; }
  })();
}

/* ---------------- selftest ---------------- */
if (location.search.includes("selftest")) {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  (async () => {
    try {
      $("#btnStart").click();
      await wait(400);
      const out = [];
      for (const c of ["听我说钱", "我要转钱", "回家", "再说一遍", "存养老金", "问问反诈", "去我的", "重要提醒", "暂停语音", "继续语音"]) {
        runVoiceCommand(c);
        await wait(450);
        out.push(c + "=" + state.pageElder);
      }
      sendChat("群里说投养老项目每月返大钱稳赚");
      await wait(1000);
      out.push("fraudHits=" + state.fraudHits, "events=" + state.events.length);
      goto("transfer");
      for (const k of ["8", "0", "0", "0", "0"]) ACTS.pad({ k });
      out.push("pad=" + $("#amtDisplay").textContent.trim());
      ACTS.pad({ k: "del" });
      out.push("padDel=" + state.transferAmount);
      switchRole("kid");
      for (const id of ["khome", "kevents", "kplan", "kcare"]) {
        const html = SCREENS[id]();
        out.push(id + ":" + (html && html.length > 50 ? "ok" : "EMPTY"));
      }
      ACTS.kmockAuth();
      ACTS.calcGap(); ACTS.calcTax();
      out.push("gap=" + (state.plan.gap ? "ok" : "x"), "tax=" + (state.plan.tax ? "ok" : "x"));
      ACTS.lifeEvent({ k: "baby" });
      ACTS.calcGap();
      out.push("ring=" + /ringGrad/.test(SCREENS.kplan()));
      ACTS.kmockTransfer();
      out.push("trend=" + /class="trend"/.test(SCREENS.kevents()));
      out.push("v=" + state.plan.versions.length);
      ACTS.quizStart(); ACTS.quizPick({ id: "1" }); ACTS.quizNext(); ACTS.quizPick({ id: "1" }); ACTS.quizNext(); ACTS.quizPick({ id: "1" }); ACTS.quizNext();
      out.push("quiz=" + state.quiz.done, "pts=" + state.points);
      state.memos.push({ body: "12月10日 带爸测血压" });
      out.push("kidRemindersMerge=" + (state.memos.length === 1));
      $("#apptBranch") && $("#apptBranch").value;
      state.pageKid = "kcare"; render();
      ACTS.apptBook();
      out.push("appt=" + state.appointments.length);
      state.points = 100; ACTS.exchange({ id: "g1" });
      out.push("gifts=" + state.gifts.length, "pointsLeft=" + state.points);
      switchRole("elder");
      out.push("memoSeen=" + /带爸测血压/.test(SCREENS.reminders()), "quizCard=" + /反诈课/.test(SCREENS.home()));
      out.push("quickCall=" + /呼叫儿子/.test(SCREENS.home()), "apptOnHome=" + /约好了网点/.test(SCREENS.home()));
      out.push("noParens=" + !/大白话\)|能少交税|广告都挡|只有关紧|存全年/.test(SCREENS.home() + SCREENS.deposit() + SCREENS.reminders()));
      ACTS.call({ k: "son" });
      out.push("callModal=" + /已接通/.test($("#modalRoot").innerHTML));
      closeModal();
      ACTS.sayAppt();
      out.push("captionShown=" + !$("#captionBar").classList.contains("idle"));
      document.title = "SELFTEST " + out.join(" | ");
    } catch (e) { document.title = "SELFTEST ERR " + e.message + " @ " + (e.stack || "").split("\n")[1]; }
  })();
}
