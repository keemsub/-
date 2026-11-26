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
  let volume = 0.6;
  const buffers = {};

  function audio() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
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
    const base = 2600 + Math.random() * 1600;
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
      g.gain.linearRampToValueAtTime(0.05, t + 0.01);
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
      const a = bed("pink", [["lowpass", 6000]], 0.55, out);
      return [() => a.src.stop()];
    },
    rain(out) {
      const hiss = bed("white", [["highpass", 500], ["lowpass", 7000]], 0.6, out);
      const rumble = bed("brown", [["lowpass", 400]], 0.6, out);
      const swell = lfo(hiss.gain.gain, 0.07, 0.15);
      const stopDrops = sprinkle(
        () => burst(out, { type: "bandpass", freq: 1800 + Math.random() * 3500, q: 2, peak: 0.08 + Math.random() * 0.12, length: 0.03 }),
        15,
        70,
      );
      return [() => hiss.src.stop(), () => rumble.src.stop(), () => swell.stop(), stopDrops];
    },
    fire(out) {
      const roar = bed("brown", [["lowpass", 600]], 1.4, out);
      const flicker = lfo(roar.gain.gain, 0.4, 0.4);
      const stopCrackle = sprinkle(
        () => burst(out, { type: "highpass", freq: 1500 + Math.random() * 2500, peak: 0.2 + Math.random() * 0.45, length: 0.008 + Math.random() * 0.03 }),
        40,
        320,
      );
      const stopPop = sprinkle(
        () => burst(out, { type: "bandpass", freq: 300 + Math.random() * 500, q: 1.5, peak: 0.7, length: 0.06 }),
        1500,
        5000,
      );
      return [() => roar.src.stop(), () => flicker.stop(), stopCrackle, stopPop];
    },
    waves(out) {
      const sea = bed("pink", [["lowpass", 1100]], 0.45, out);
      const surge = lfo(sea.gain.gain, 1 / 9, 0.38); // 9초마다 밀려왔다 빠져요
      const foam = bed("white", [["highpass", 2500]], 0.04, out);
      const foamSurge = lfo(foam.gain.gain, 1 / 9, 0.035);
      return [() => sea.src.stop(), () => surge.stop(), () => foam.src.stop(), () => foamSurge.stop()];
    },
    forest(out) {
      const wind = bed("pink", [["bandpass", 500, 0.6]], 0.5, out);
      const breeze = lfo(wind.gain.gain, 1 / 7, 0.25);
      const stopBirds = sprinkle(() => chirp(out), 1200, 4500);
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
    out.gain.linearRampToValueAtTime(1, ctx.currentTime + 1.2);
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
    if (master) master.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  return { SOUNDS, play, stop, setVolume, playing: () => current?.id ?? null };
})();
