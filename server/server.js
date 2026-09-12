/*
 * 工银颐享 · 多智能体编排服务(零依赖,Node >= 16)
 * ------------------------------------------------------------
 * 启动:  node server/server.js        (默认 http://localhost:8787)
 * 能力:
 *   1. 静态托管 Demo(与直接打开 index.html 等效,且引擎自动切换为服务编排模式)
 *   2. POST /api/chat        多智能体编排:意图路由 → 风控合规 → 金融知识/业务办理 → 适老关怀
 *   3. GET  /api/metrics     风控模型真实评估指标(5 折交叉验证 + 双层校验漏斗)
 *   4. GET/POST /wechat/webhook  微信公众号回调(GET 验证 + XML 消息自动回复)
 *   5. POST /api/sms-guard   陌生大额转账短信检测(演示接口)
 * 合规: 密钥经环境变量注入(WECHAT_TOKEN),日志不落 PII 明文。
 */
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const RiskModel = require("../js/risk-model.js");

const PORT = process.env.PORT || 8787;
const ROOT = path.join(__dirname, "..");
const WECHAT_TOKEN = process.env.WECHAT_TOKEN || "";

/* ---------------- 知识库(RAG-lite:检索式问答) ---------------- */
const KB = [
  { k: ["个人养老金", "缴存", "存多少", "抵税"], a: "个人养老金账户每年最多存 12000 元,当年就能少交个税,退休后再取。要是您每年交的税超过 3% 这一档,存满一般比较划算。" },
  { k: ["定期", "到期", "取出来", "转存"], a: "您的定期到期后,钱和利息自动可以取,手机上点一下就能转成活期,不用跑网点。到期前我们会提前提醒您。" },
  { k: ["社保卡", "激活", "办卡", "网点", "预约"], a: "带身份证到网点就能办,子女也可以在手机银行帮您预约,到店有适老窗口,工作人员面对面帮您弄。" },
  { k: ["存款保险", "保五十万", "安全吗"], a: "是真的:同一家人在同一家银行,存款本息 50 万以内受《存款保险条例》全额保障,放心。" },
  { k: ["余额", "账单", "查一下", "流水"], a: "您对我说“查余额”,我就在屏幕上把大字账单念给您听;明细只显示最近几笔,看不清可以让我们慢慢讲。" },
  { k: ["语音", "语速", "慢一点", "大声"], a: "您说“慢一点”“大声一点”,我就照办;重要的数字我会重复一遍,直到您听清楚。" },
];
function kbAnswer(text) {
  let best = null, score = 0;
  KB.forEach(item => {
    const s = item.k.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0);
    if (s > score) { score = s; best = item; }
  });
  return score ? best.a : null;
}

/* ---------------- 多智能体编排 ---------------- */
function orchestrate(text) {
  const trace = ["意图路由 Agent"];
  const rk = RiskModel.predict(text);
  const rule = RiskModel.ruleReview(text);
  const risk = rk.label === "scam" && rk.p >= 0.55;
  let intent = risk ? "风控拦截" : (/(查|余额|账单|流水)/.test(text) ? "查询" : /(办|预约|挂失)/.test(text) ? "办理" : "咨询");
  let reply, riskBasis = null;

  if (risk) {
    trace.push("风控合规 Agent(分类器 p=" + Math.round(rk.p * 100) + "%)");
    reply = "这句话里有几个危险的信号:" + rk.top.map(t => "「" + t.g + "」").join("")
      + "。凡是让您转钱、交费、报验证码的,先停一停,给家人或 95588 打个电话问问,不着急。";
    riskBasis = { p: rk.p, top: rk.top, layer2: rule.pass, ruleHits: rule.hits };
  } else {
    const kb = kbAnswer(text);
    if (intent === "办理") {
      trace.push("业务办理 Agent(沙箱核心 API)");
      const no = "ICBC" + Date.now().toString().slice(-8);
      reply = "好的,已经帮您把这件事登记好了,工单号 " + no + ",带身份证到网点就能办,到时候有工作人员帮您。";
    } else {
      trace.push("金融知识 Agent(RAG-lite 检索)");
      reply = kb || "您说的这件事我记下了,建议到网点或者打 95588 再确认一遍;凡是让您先交钱再等好处的,都要多留个心眼。";
    }
  }
  trace.push("适老关怀 Agent(大字 · 慢语速)");
  return { intent, reply, risk, riskBasis, trace, engine: RiskModel.version };
}

/* ---------------- 微信 XML ---------------- */
function xmlEscape(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function xmlGet(xml, tag) {
  const m = xml.match(new RegExp("<" + tag + ">(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</" + tag + ">"));
  return m ? m[1] : "";
}
function checkSignature(qs) {
  if (!WECHAT_TOKEN) return true; // 未配置 token 时跳过(演示环境)
  const s = [WECHAT_TOKEN, qs.timestamp || "", qs.nonce || ""].sort().join("");
  return crypto.createHash("sha1").update(s).digest("hex") === (qs.signature || "");

}

const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".md": "text/markdown; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png" };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  const p = url.pathname;

  if (p === "/api/health") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ ok: true, engine: RiskModel.version, wechat: WECHAT_TOKEN ? "token已配置" : "未配置token(跳过验签)" }));
  }

  if (p === "/api/metrics") {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ cv: RiskModel.crossValidate(5), funnel: RiskModel.funnel() }));
  }

  if (p === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      let text = "";
      try { text = String(JSON.parse(body).text || ""); } catch (e) {}
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(orchestrate(text)));
    });
    return;
  }

  if (p === "/api/sms-guard" && req.method === "POST") {
    let body = "";
    req.on("data", c => body += c);
    req.on("end", () => {
      let text = "";
      try { text = String(JSON.parse(body).text || ""); } catch (e) {}
      const r = RiskModel.predict(text);
      const rule = RiskModel.ruleReview(text);
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ risk: r.label === "scam" && r.p >= 0.55, p: r.p, layer2: rule.pass, top: r.top }));
    });
    return;
  }

  if (p === "/wechat/webhook") {
    const qs = Object.fromEntries(url.searchParams.entries());
    if (req.method === "GET") {
      if (!checkSignature(qs)) { res.writeHead(403); return res.end("forbidden"); }
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(qs.echostr || "gonghang-echo");
    }
    if (req.method === "POST") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        const from = xmlGet(body, "FromUserName");
        const to = xmlGet(body, "ToUserName");
        const content = xmlGet(body, "Content");
        const r = orchestrate(content || "你好");
        const xml = `<xml><ToUserName><![CDATA[${xmlEscape(from)}]]></ToUserName><FromUserName><![CDATA[${xmlEscape(to)}]]></FromUserName><CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${xmlEscape(r.reply)}]]></Content></xml>`;
        res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8" });
        res.end(xml);
      });
      return;
    }
  }

  // 静态托管
  let file = p === "/" ? "/index.html" : p;
  file = path.normalize(file).replace(/^(\.\.[\/\\])+/, "");
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("404 Not Found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(full)] || "application/octet-stream" });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const cv = RiskModel.crossValidate(5), fu = RiskModel.funnel();
  console.log("[工银颐享] 编排服务已启动: http://localhost:" + PORT);
  console.log(`[风控模型] ${RiskModel.version} 语料 ${fu.corpus} 条 | 5折CV 准确率 ${(cv.acc * 100).toFixed(1)}% 精确率 ${(cv.prec * 100).toFixed(1)}% 召回率 ${(cv.rec * 100).toFixed(1)}% F1 ${(cv.f1 * 100).toFixed(1)}%`);
  console.log(`[双层校验] 语料初筛命中 ${fu.first} · 风控复核通过 ${fu.passed} · 低置信过滤 ${fu.filtered}`);
  console.log("[微信] webhook: /wechat/webhook " + (WECHAT_TOKEN ? "(已配置token)" : "(未配置token,验签跳过)"));
});
