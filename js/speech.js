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
  start(onText, onEnd) {
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
    if (this.rec) { try { this.rec.stop(); } catch (e) {} }
  },
};

TTS.init();
