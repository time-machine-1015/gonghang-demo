/*
 * 可插拔引擎层(Engine Abstraction)
 * ------------------------------------------------------------
 * 三种模式,自动探测、手动优先:
 *   1. server  — 本地多智能体编排服务(node server/server.js, /api/chat)
 *   2. llm     — OpenAI 兼容大模型接口(用户在左侧"引擎设置"填 endpoint/key)
 *   3. local   — 浏览器内置风控分类器 + 规则(默认,离线可用)
 * 均通过 Engine.decide(text) 返回统一结构:
 *   { reply, risk, source, trace:[Agent调度轨迹], riskBasis }
 * 密钥只存 localStorage,不写入任何代码与仓库。
 */
(function (root) {
  "use strict";

  const CFG_KEY = "gonghang.engineConfig";
  function cfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || "{}"); } catch (e) { return {}; }
  }
  function saveCfg(c) { localStorage.setItem(CFG_KEY, JSON.stringify(c || {})); }

  let serverOk = null; // null=未探测

  function probeServer() {
    if (serverOk !== null) return Promise.resolve(serverOk);
    if (location.protocol === "file:") { serverOk = false; return Promise.resolve(false); }
    return fetch("/api/health", { method: "GET" })
      .then(r => r.ok && (serverOk = true))
      .catch(() => { serverOk = false; return false; });
  }

  function serverChat(text) {
    return fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, side: "elder" }),
    }).then(r => r.json()).then(d => {
      if (!d || !d.reply) throw new Error("bad server reply");
      return { reply: d.reply, risk: !!d.risk, source: "server", trace: d.trace || [], riskBasis: d.riskBasis || null };
    });
  }

  function llmChat(text) {
    const c = cfg().llm || {};
    if (!c.endpoint) return Promise.reject(new Error("no llm"));
    return fetch(c.endpoint.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + (c.apiKey || "") },
      body: JSON.stringify({
        model: c.model || "glm-4-flash",
        messages: [
          { role: "system", content: "你是工商银行手机银行里的适老金融助手。用大白话、短句子回答长辈的问题;凡是涉及转钱、验证码、安全账户、高息回报的说法,必须温和地提醒风险并给出 96110/95588 求证渠道;不推荐任何产品,不代替用户做决定。控制在 120 字以内。" },
          { role: "user", content: text },
        ],
        temperature: 0.4,
      }),
    }).then(r => r.json()).then(d => {
      const reply = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
      if (!reply) throw new Error("bad llm reply");
      return { reply, risk: null, source: "llm", trace: ["LLM(" + (c.model || "glm") + ")"], riskBasis: null };
    });
  }

  function localDecide(text, state) {
    const rk = root.RiskModel.predict(text);
    const rule = (root.CHAT_RULES || []).find(r => r.keys.some(k => text.includes(k)));
    const risk = rule ? !!rule.risk : (rk.label === "scam" && rk.p >= 0.55);
    const low = !rule && !risk && rk.p >= 0.4;
    return { rk, rule, risk, low };
  }

  function decide(text, state) {
    const c = cfg();
    // 手动选择了 LLM → 优先 LLM(风险判定仍由本地分类器兜底)
    if (c.llm && c.llm.endpoint) {
      return llmChat(text).then(r => {
        const rk = root.RiskModel.predict(text);
        r.risk = (root.CHAT_RULES || []).some(x => x.risk && x.keys.some(k => text.includes(k))) || (rk.label === "scam" && rk.p >= 0.55);
        r.riskBasis = rk;
        return r;
      }).catch(() => decideLocal(text, state));
    }
    // 探测到本地编排服务 → 走多智能体链路
    return probeServer().then(ok => (ok ? serverChat(text).catch(() => decideLocal(text, state)) : decideLocal(text, state)));
  }

  function decideLocal(text, state) {
    const { rk, rule, risk, low } = localDecide(text, state);
    const ruleHits = root.RiskModel.ruleReview(text);
    let reply, basis = null;
    if (risk) {
      reply = rule ? rule.reply
        : "这句话里有几个危险的信号:" + rk.top.map(t => "「" + t.g + "」").join("") + "。凡是让您转钱、交费、报验证码的,先停一停,给家人或 95588 打个电话问问,不着急。";
      basis = { p: rk.p, top: rk.top, ruleHits: ruleHits.hits, layer2: ruleHits.pass, rule: rule || null };
    } else if (rule) {
      reply = rule.reply;
    } else if (low) {
      reply = "您说的这事我不太确定,先不多嘴。不过凡是让您先交钱再等好处的,都要多留个心眼。您可以把事情慢慢讲给我听。";
    } else {
      reply = "我先把这句话记下了。凡是让您“马上转钱、别告诉家人”的,都要当心。要不您把事情经过慢慢说给我听?也可以点下面灰色的常见问题。";
    }
    return Promise.resolve({
      reply, risk, source: "local",
      trace: ["意图路由(本地)", risk ? "风控Agent·分类器" : "金融知识Agent(本地)", "适老关怀Agent"],
      riskBasis: basis,
    });
  }

  root.EngineConfig = { get: cfg, set: saveCfg };
  root.Engine = { decide, probeServer, _localDecide: localDecide };
})(window);
