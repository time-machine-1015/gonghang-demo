const TTS = {
  voice: null,
  ready: false,
  init() {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      const vs = window.speechSynthesis.getVoices();
      this.voice =
        vs.find(v => v.lang === "zh-CN" && /Xiaoxiao|yunxi|Ting|kang/i.test(v.name)) ||
        vs.find(v => /^zh(-|_)/i.test(v.lang)) ||
        vs.find(v => /Chinese|中文|普通话/i.test(v.name)) || null;
      this.ready = true;
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  },
  speak(text, { rate = 0.9, volume = 1 } = {}) {
    if (!("speechSynthesis" in window)) return;
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "zh-CN";
      if (this.voice) u.voice = this.voice;
      u.rate = rate;
      u.volume = volume;
      u.pitch = 1.05;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  },
  stop() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  },
};

const STT = {
  supported: !!(window.SpeechRecognition || window.webkitSpeechRecognition),
  rec: null,
  asrEndpoint() {
    try { return (JSON.parse(localStorage.getItem("gonghang.engineConfig") || "{}").asr || {}).endpoint || ""; }
    catch (e) { return ""; }
  },
  // 远程转写(FunASR/Whisper 兼容:POST 音频,返回 {text} 或 {result})
  remoteStart(onText, onEnd) {
    const url = this.asrEndpoint();
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      const chunks = [];
      const mr = new MediaRecorder(stream);
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("audio", blob, "speech.webm");
        fetch(url, { method: "POST", body: fd })
          .then(r => r.json())
          .then(d => { const t = d.text || d.result || ""; if (t) onText(t); })
          .catch(() => {})
          .finally(() => onEnd && onEnd());
      };
      mr.start();
      this.rec = { stop: () => { try { mr.state !== "inactive" && mr.stop(); } catch (e) {} } };
      // 最长 8 秒自动结束
      this._auto = setTimeout(() => this.stop(), 8000);
    }).catch(() => onEnd && onEnd());
  },
  start(onText, onEnd) {
    if (this.asrEndpoint() && navigator.mediaDevices && window.MediaRecorder) {
      return this.remoteStart(onText, onEnd), true;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return false;
    const r = new SR();
    r.lang = "zh-CN";
    r.continuous = false;
    r.interimResults = false;
    r.onresult = e => {
      const t = e.results[0][0].transcript;
      onText(t);
    };
    r.onend = () => onEnd && onEnd();
    r.onerror = () => onEnd && onEnd();
    r.start();
    this.rec = r;
    return true;
  },
  stop() {
    if (this._auto) { clearTimeout(this._auto); this._auto = null; }
    if (this.rec) { try { this.rec.stop(); } catch (e) {} }
  },
};

TTS.init();
