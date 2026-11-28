// 집중할 때 듣는 배경 소리. 음원 파일 없이 브라우저(Web Audio)가 직접 소리를 만들어요.
// 그래서 저작권 걱정이 없고, 인터넷이 느려도 바로 나와요.
// 새 소리를 넣고 싶으면 SOUNDS 목록에 한 줄, BUILDERS에 만드는 방법을 추가하면 돼요.
const Sound = (() => {
  const SOUNDS = [
    { id: "white", icon: "🌫️", name: "백색소음" },
    { id: "rain", icon: "🌧️", name: "빗소리" },
    { id: "fire", icon: "🔥", name: "장작 타는 소리" },
    { id: "waves", icon: "🌊", name: "파도 소리" },
    { id: "forest", icon: "🌲", name: "숲속 새소리" },
  ];

  let ctx = null;
  let master = null;
  let current = null; // { id, stop() }
  let volume = 0.4;
  // 모든 소리를 한 번 더 부드럽게: 전체 크기를 낮추고(TRIM), 귀에 거슬리는 높은 소리를 깎아요(SOFT_HZ).
  const TRIM = 0.5;
  const SOFT_HZ = 3200;
  const buffers = {};

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume * TRIM;
      const soft = ctx.createBiquadFilter();
      soft.type = "lowpass";
      soft.frequency.value = SOFT_HZ;
      soft.Q.value = 0.5;
      // 갑자기 큰 소리가 나도 부드럽게 눌러 줘요
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -24;
      limiter.ratio.value = 6;
      limiter.attack.value = 0.01;
      limiter.release.value = 0.3;
      master.connect(soft);
      soft.connect(limiter);
      limiter.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  // 4초짜리 잡음을 만들어 반복 재생해요. white는 쏴아, pink는 부드럽게, brown은 웅웅 낮게.
  function noise(kind) {
    if (buffers[kind]) return buffers[kind];
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") d[i] = w * 0.5;
      else if (kind === "pink") {
        b0 = 0.997 * b0 + w * 0.029591;
        b1 = 0.985 * b1 + w * 0.032534;
        b2 = 0.95 * b2 + w * 0.048056;
        d[i] = (b0 + b1 + b2 + w * 0.05) * 1.6;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // 이음매에서 '틱' 소리가 나지 않게 앞뒤를 살짝 줄여요
    for (let i = 0; i < 2000; i++) {
      d[i] *= i / 2000;
      d[len - 1 - i] *= i / 2000;
    }
    buffers[kind] = buf;
    return buf;
  }

  function bed(kind, filters, gainValue, out) {
    const src = ctx.createBufferSource();
    src.buffer = noise(kind);
    src.loop = true;
    src.loopStart = 0.05;
    src.loopEnd = 3.95;
    let node = src;
    for (const [type, freq, q] of filters) {
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      if (q) f.Q.value = q;
      node.connect(f);
      node = f;
    }
    const g = ctx.createGain();
    g.gain.value = gainValue;
    node.connect(g);
    g.connect(out);
    src.start();
    return { src, gain: g };
  }

  // 아주 짧은 소리 한 번 (빗방울, 장작 탁탁)
  function burst(out, { type, freq, q = 1, peak, length }) {
    const t = ctx.currentTime + 0.01;
    const src = ctx.createBufferSource();
    src.buffer = noise("white");
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(f);
    f.connect(g);
    g.connect(out);
    src.start(t, Math.random() * 3.5, length + 0.05);
  }

  // 일정하지 않은 간격으로 계속 부르기
  function sprinkle(fn, minMs, maxMs) {
    let timer = null;
    const next = () => {
      fn();
      timer = setTimeout(next, minMs + Math.random() * (maxMs - minMs));
    };
    timer = setTimeout(next, minMs);
    return () => clearTimeout(timer);
  }

  function lfo(param, rateHz, depth) {
    const osc = ctx.createOscillator();
    const amt = ctx.createGain();
    osc.frequency.value = rateHz;
    amt.gain.value = depth;
    osc.connect(amt);
    amt.connect(param);
    osc.start();
    return osc;
  }

  // 짹짹: 높은 음이 빠르게 오르내리는 짧은 소리 몇 번
  function chirp(out) {
    const base = 2000 + Math.random() * 1000;
    const n = 2 + Math.floor(Math.random() * 4);
    let t = ctx.currentTime + 0.02;
    for (let i = 0; i < n; i++) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 1.35, t + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.09);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.018, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + 0.12);
      t += 0.13 + Math.random() * 0.08;
    }
  }

  const BUILDERS = {
    white(out) {
      // 쏴아 대신 '후웅' 하는 낮고 포근한 잡음
      const a = bed("pink", [["lowpass", 1600]], 0.4, out);
      return [() => a.src.stop()];
    },
    rain(out) {
      // 창밖에 내리는 잔잔한 비: 쏴아 소리는 줄이고 빗방울은 작고 드문드문
      const hiss = bed("pink", [["highpass", 300], ["lowpass", 2400]], 0.3, out);
      const rumble = bed("brown", [["lowpass", 300]], 0.35, out);
      const swell = lfo(hiss.gain.gain, 0.05, 0.08);
      const stopDrops = sprinkle(
        () => burst(out, { type: "bandpass", freq: 1200 + Math.random() * 1600, q: 3, peak: 0.015 + Math.random() * 0.03, length: 0.025 }),
        40,
        180,
      );
      return [() => hiss.src.stop(), () => rumble.src.stop(), () => swell.stop(), stopDrops];
    },
    fire(out) {
      // 멀리서 타닥타닥: 웅웅거림과 '딱' 소리를 크게 줄였어요
      const roar = bed("brown", [["lowpass", 450]], 0.6, out);
      const flicker = lfo(roar.gain.gain, 0.25, 0.15);
      const stopCrackle = sprinkle(
        () => burst(out, { type: "bandpass", freq: 1200 + Math.random() * 1300, q: 1.5, peak: 0.04 + Math.random() * 0.08, length: 0.008 + Math.random() * 0.02 }),
        90,
        500,
      );
      const stopPop = sprinkle(
        () => burst(out, { type: "bandpass", freq: 300 + Math.random() * 300, q: 1.5, peak: 0.14, length: 0.05 }),
        3000,
        8000,
      );
      return [() => roar.src.stop(), () => flicker.stop(), stopCrackle, stopPop];
    },
    waves(out) {
      // 먼바다의 느린 파도: 더 낮고, 더 천천히(11초), 철썩임은 살짝만
      const sea = bed("pink", [["lowpass", 700]], 0.3, out);
      const surge = lfo(sea.gain.gain, 1 / 11, 0.2);
      const foam = bed("pink", [["bandpass", 1400, 0.7]], 0.04, out);
      const foamSurge = lfo(foam.gain.gain, 1 / 11, 0.03);
      return [() => sea.src.stop(), () => surge.stop(), () => foam.src.stop(), () => foamSurge.stop()];
    },
    forest(out) {
      // 바람은 살랑, 새는 멀리서 가끔
      const wind = bed("pink", [["bandpass", 450, 0.6]], 0.3, out);
      const breeze = lfo(wind.gain.gain, 1 / 8, 0.12);
      const stopBirds = sprinkle(() => chirp(out), 2500, 7000);
      return [() => wind.src.stop(), () => breeze.stop(), stopBirds];
    },
  };

  function play(id) {
    stop();
    if (!BUILDERS[id]) return;
    audio();
    // 소리마다 따로 볼륨 통로를 만들어 부드럽게 켜고 꺼요
    const out = ctx.createGain();
    out.gain.setValueAtTime(0, ctx.currentTime);
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 3); // 3초 동안 천천히 커져요
    out.connect(master);
    const stops = BUILDERS[id](out);
    current = {
      id,
      stop() {
        const t = ctx.currentTime;
        out.gain.cancelScheduledValues(t);
        out.gain.setValueAtTime(out.gain.value, t);
        out.gain.linearRampToValueAtTime(0, t + 0.6);
        setTimeout(() => {
          for (const s of stops) {
            try {
              s();
            } catch {
              // 이미 멈춘 소리
            }
          }
          out.disconnect();
        }, 700);
      },
    };
  }

  function stop() {
    if (current) current.stop();
    current = null;
  }

  function setVolume(v) {
    volume = v;
    if (master) master.gain.setTargetAtTime(v * TRIM, ctx.currentTime, 0.05);
  }

  return { SOUNDS, play, stop, setVolume, playing: () => current?.id ?? null };
})();
