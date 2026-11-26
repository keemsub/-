// 걸음모도로 화면 코드
// 흐름: 목적지 정하기 → 집중 시작 → 캐릭터가 길을 따라 걸어감 → 집중이 끝나면 거기까지 기록
// 목적지가 멀면(예: 제주도) 여러 번 집중해서 조금씩 이어 걸어가요.

const FALLBACK = { lat: 37.5665, lon: 126.978 }; // 위치 권한이 없을 때: 서울시청
// 주소 끝에 ?fast=1 을 붙이면 1분이 1초로 줄어요 (테스트용)
const MS_PER_MINUTE = new URLSearchParams(location.search).has("fast") ? 1000 : 60000;
let WALK_KMH = 4.5; // 서버 설정(/api/config)으로 덮어써요

const CHARACTERS = [
  { id: "turtle", emoji: "🐢", name: "거북이", line: "느려도 끝까지 가요" },
  { id: "snail", emoji: "🐌", name: "달팽이", line: "한 걸음씩, 천천히" },
  { id: "penguin", emoji: "🐧", name: "펭귄", line: "뒤뚱뒤뚱 산책 중" },
  { id: "cat", emoji: "🐈", name: "고양이", line: "골목 구석구석 탐험가" },
  { id: "dog", emoji: "🐕", name: "강아지", line: "신나서 앞장서요" },
  { id: "rabbit", emoji: "🐇", name: "토끼", line: "깡총깡총 가볍게" },
  { id: "hedgehog", emoji: "🦔", name: "고슴도치", line: "조용히 꾸준히" },
  { id: "duck", emoji: "🦆", name: "오리", line: "물가를 좋아해요" },
];

const MAP_STYLES = [
  { id: "liberty", name: "3D 거리", url: "https://tiles.openfreemap.org/styles/liberty", pitch: 55 },
  { id: "positron", name: "밝은 지도", url: "https://tiles.openfreemap.org/styles/positron", pitch: 45 },
  { id: "bright", name: "선명한 지도", url: "https://tiles.openfreemap.org/styles/bright", pitch: 50 },
];

const $ = (id) => document.getElementById(id);
// 받침에 따라 조사를 골라요: josa("펭귄", "이", "가") → "이"
const josa = (word, withBatchim, without) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? withBatchim : without;
};
const iga = (w) => `${w}${josa(w, "이", "가")}`;
const wagwa = (w) => `${w}${josa(w, "과", "와")}`;
const RING = 2 * Math.PI * 52;

// ---------- 저장 (브라우저 localStorage) ----------
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`walkmodoro:${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`walkmodoro:${key}`, JSON.stringify(value));
    } catch {
      // 시크릿 모드 등 저장이 막힌 곳에서는 조용히 넘어가요.
    }
  },
};

let character = CHARACTERS.find((c) => c.id === store.get("character", "turtle")) || CHARACTERS[0];
let styleIndex = Math.max(0, MAP_STYLES.findIndex((s) => s.id === store.get("mapStyle", "liberty")));
let journey = store.get("journey", null);
let minutes = 25;

// ---------- 거리 계산 도우미 ----------
function haversine([lon1, lat1], [lon2, lat2]) {
  const r = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dp = toRad(lat2 - lat1);
  const dl = toRad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(a));
}

// 경로를 '앞에서부터 몇 m 지점'으로 다룰 수 있게 누적 거리를 미리 계산해요.
function buildPath(coords) {
  const cum = [0];
  for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + haversine(coords[i - 1], coords[i]));
  const total = cum[cum.length - 1] || 0;
  return { coords, cum, total };
}

function pointAt(path, d) {
  const { coords, cum, total } = path;
  if (d <= 0 || coords.length < 2) return { point: coords[0], index: 0 };
  if (d >= total) return { point: coords[coords.length - 1], index: coords.length - 2 };
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cum[hi] - cum[lo] || 1;
  const t = (d - cum[lo]) / seg;
  const [a, b] = [coords[lo], coords[hi]];
  return { point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], index: lo };
}

function sliceTo(path, d) {
  const { point, index } = pointAt(path, d);
  return [...path.coords.slice(0, index + 1), point];
}

const formatDistance = (m) =>
  m >= 10000 ? `${(m / 1000).toFixed(0)}km` : m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${Math.round(m)}m`;

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...FALLBACK, fallback: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ ...FALLBACK, fallback: true }),
      { timeout: 8000, maximumAge: 60000 },
    );
  });
}

async function api(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// ---------- 지도 ----------
const map = new maplibregl.Map({
  container: "map",
  style: MAP_STYLES[styleIndex].url,
  center: [FALLBACK.lon, FALLBACK.lat],
  zoom: 15,
  pitch: MAP_STYLES[styleIndex].pitch,
  bearing: -12,
  attributionControl: { compact: true },
  maxPitch: 70,
});

const EMPTY_LINE = { type: "Feature", geometry: { type: "LineString", coordinates: [] } };
let path = journey ? buildPath(journey.route.coordinates) : null;

function addOverlays() {
  // 3D 건물: 스타일에 없으면 직접 추가해요.
  const style = map.getStyle();
  const has3d = style.layers.some((l) => l.type === "fill-extrusion");
  if (!has3d && style.sources.openmaptiles) {
    const firstLabel = style.layers.find((l) => l.type === "symbol")?.id;
    map.addLayer(
      {
        id: "wm-buildings-3d",
        type: "fill-extrusion",
        source: "openmaptiles",
        "source-layer": "building",
        minzoom: 14,
        paint: {
          "fill-extrusion-color": "#efe7da",
          "fill-extrusion-height": ["coalesce", ["get", "render_height"], 8],
          "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
          "fill-extrusion-opacity": 0.85,
        },
      },
      firstLabel,
    );
  }

  map.addSource("wm-route", { type: "geojson", data: EMPTY_LINE });
  map.addSource("wm-walked", { type: "geojson", data: EMPTY_LINE });
  map.addLayer({
    id: "wm-route",
    type: "line",
    source: "wm-route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3fae7c", "line-width": 5, "line-opacity": 0.35, "line-dasharray": [1, 1.6] },
  });
  map.addLayer({
    id: "wm-walked-glow",
    type: "line",
    source: "wm-walked",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#ffffff", "line-width": 11, "line-opacity": 0.9 },
  });
  map.addLayer({
    id: "wm-walked",
    type: "line",
    source: "wm-walked",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": "#3fae7c", "line-width": 6 },
  });
  drawJourney();
}
map.on("style.load", addOverlays);

// 아래 카드에 가리지 않도록 지도의 '가운데'를 카드 위쪽으로 올려요.
function updatePadding() {
  const sheet = document.querySelector(".sheet");
  const wide = innerWidth >= 900;
  map.setPadding({
    top: 70,
    bottom: wide ? 0 : sheet.offsetHeight + 12,
    left: wide ? sheet.offsetWidth + 24 : 0,
    right: 0,
  });
}
addEventListener("resize", updatePadding);

function setLine(id, coords) {
  const src = map.getSource(id);
  if (src) src.setData({ type: "Feature", geometry: { type: "LineString", coordinates: coords } });
}

// HTML로 만드는 지도 위 표시들
function walkerElement() {
  const el = document.createElement("div");
  el.className = "walker";
  el.innerHTML = '<div class="walker-body"></div><div class="walker-shadow"></div>';
  return el;
}
function pinElement(emoji, label) {
  const el = document.createElement("div");
  el.className = "pin";
  el.innerHTML = '<div class="pin-bubble"></div><div class="pin-emoji"></div>';
  el.querySelector(".pin-bubble").textContent = label;
  el.querySelector(".pin-emoji").textContent = emoji;
  return el;
}

const walkerEl = walkerElement();
const walker = new maplibregl.Marker({ element: walkerEl, anchor: "bottom" });
const originEl = document.createElement("div");
originEl.className = "origin-dot";
const originMarker = new maplibregl.Marker({ element: originEl });
let destMarker = null;
let walkerShown = false;

function setWalker(lngLat, nextLngLat) {
  walker.setLngLat(lngLat);
  if (!walkerShown) {
    walker.addTo(map);
    walkerShown = true;
  }
  const body = walkerEl.querySelector(".walker-body");
  body.textContent = character.emoji;
  // 동물 이모지는 대부분 왼쪽을 보고 있어서, 오른쪽(동쪽)으로 갈 땐 뒤집어요.
  if (nextLngLat) body.classList.toggle("flip", nextLngLat[0] > lngLat[0]);
}

function drawJourney() {
  if (!journey || !path) {
    setLine("wm-route", []);
    setLine("wm-walked", []);
    originMarker.remove();
    destMarker?.remove();
    walker.remove();
    walkerShown = false;
    return;
  }
  setLine("wm-route", path.coords);
  setLine("wm-walked", sliceTo(path, journey.walked_m));
  originMarker.setLngLat(path.coords[0]).addTo(map);
  destMarker?.remove();
  destMarker = new maplibregl.Marker({ element: pinElement("🏁", journey.name), anchor: "bottom" })
    .setLngLat(path.coords[path.coords.length - 1])
    .addTo(map);
  const here = pointAt(path, journey.walked_m).point;
  const ahead = pointAt(path, journey.walked_m + 30).point;
  setWalker(here, ahead);
}

function focusWalker(animate = true) {
  if (!journey || !path) return;
  const here = pointAt(path, journey.walked_m).point;
  const s = MAP_STYLES[styleIndex];
  lastFollow = Date.now() + 1300; // 이 이동이 끝날 때까지 따라가기를 잠시 멈춰요
  map.easeTo({ center: here, zoom: 16.2, pitch: s.pitch, bearing: -12, duration: animate ? 1200 : 0 });
}

function overview() {
  if (!path) return;
  const bounds = path.coords.reduce(
    (b, c) => b.extend(c),
    new maplibregl.LngLatBounds(path.coords[0], path.coords[0]),
  );
  map.fitBounds(bounds, { padding: 40, pitch: 0, bearing: 0, maxZoom: 16 });
}

// ---------- 여정 표시 ----------
function renderJourney(liveMeters) {
  $("journey-empty").hidden = !!journey;
  $("journey-set").hidden = !journey;
  $("btn-overview").hidden = !journey;
  if (!journey) return;
  const walkedM = liveMeters ?? journey.walked_m;
  const pct = Math.min(100, (walkedM / journey.route.distance_m) * 100 || 0);
  $("journey-name").textContent = journey.name;
  $("journey-bar").style.width = `${pct}%`;
  const left = Math.max(0, journey.route.distance_m - walkedM);
  $("journey-text").textContent =
    left <= 0
      ? "도착했어요! 새 목적지를 정해 볼까요?"
      : `${formatDistance(journey.route.distance_m)} 중 ${formatDistance(walkedM)} 걸음 · ${pct.toFixed(pct < 1 ? 1 : 0)}%`;
  $("journey-mode").textContent =
    journey.route.mode === "road" ? `${wagwa(character.name)} 가는 길` : `${wagwa(character.name)} 가는 길 · 직선 경로`;
  const sessionM = (WALK_KMH * 1000 * minutes) / 60;
  if (!running()) {
    $("clock-sub").textContent = left > 0 ? `이번에 ${formatDistance(Math.min(sessionM, left))}` : "도착 완료";
  }
}

function renderToday() {
  const today = store.get(`day:${new Date().toLocaleDateString("sv-SE")}`, null);
  $("today").textContent = today ? `오늘 집중 ${today.minutes}분 · ${formatDistance(today.meters)} 걸었어요` : "";
}

function renderCharacter() {
  $("char-emoji").textContent = character.emoji;
  $("brand-emoji").textContent = character.emoji;
  if (walkerShown) walkerEl.querySelector(".walker-body").textContent = character.emoji;
}

// ---------- 목적지 정하기 ----------
async function setJourney(name, address, dest) {
  closeModal("dest-modal");
  $("status").textContent = "가는 길을 찾는 중...";
  const origin = await getPosition();
  try {
    const route = await api(
      `/api/route?from_lat=${origin.lat}&from_lon=${origin.lon}&to_lat=${dest.lat}&to_lon=${dest.lon}`,
    );
    journey = { name, address, route, walked_m: 0, createdAt: Date.now() };
    path = buildPath(route.coordinates);
    store.set("journey", journey);
    drawJourney();
    renderJourney();
    overview();
    const where = origin.fallback ? "서울시청에서 출발해요 (위치 권한이 없어요). " : "";
    const sessions = Math.ceil(route.distance_m / ((WALK_KMH * 1000 * minutes) / 60));
    $("status").textContent =
      `${where}${minutes}분 집중을 ${sessions.toLocaleString()}번 하면 도착해요` +
      (route.mode === "straight" ? " (지도 위 직선으로 걸어가요)" : "");
  } catch {
    $("status").textContent = "가는 길을 찾지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

async function searchPlaces(event) {
  event.preventDefault();
  const q = $("search-input").value.trim();
  const list = $("search-results");
  if (!q) return;
  list.innerHTML = '<li class="muted small">찾는 중...</li>';
  try {
    const { results } = await api(`/api/search?q=${encodeURIComponent(q)}`);
    list.innerHTML = results.length ? "" : '<li class="muted small">검색 결과가 없어요. 다른 이름으로 찾아볼까요?</li>';
    for (const r of results) {
      const li = document.createElement("li");
      li.innerHTML = '<button type="button"><b></b><span class="addr"></span></button>';
      li.querySelector("b").textContent = r.name;
      li.querySelector(".addr").textContent = r.address;
      li.querySelector("button").addEventListener("click", () => setJourney(r.name, r.address, r));
      list.appendChild(li);
    }
  } catch {
    list.innerHTML = '<li class="muted small">검색에 실패했어요. 잠시 후 다시 시도해 주세요.</li>';
  }
}

async function randomDestination() {
  closeModal("dest-modal");
  $("status").textContent = "근처 여행지를 고르는 중...";
  const pos = await getPosition();
  try {
    const trip = await api(`/api/trip?lat=${pos.lat}&lon=${pos.lon}&minutes=${minutes}`);
    const d = trip.destination;
    await setJourney(d.name, d.kind, d);
  } catch {
    $("status").textContent = "여행지를 고르지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

let picking = false;
function startPicking() {
  closeModal("dest-modal");
  picking = true;
  const banner = $("banner");
  banner.textContent = "지도를 눌러 목적지를 골라요";
  banner.hidden = false;
  map.getCanvas().style.cursor = "crosshair";
}
map.on("click", (e) => {
  if (!picking) return;
  picking = false;
  $("banner").hidden = true;
  map.getCanvas().style.cursor = "";
  setJourney("내가 고른 곳", "", { lat: e.lngLat.lat, lon: e.lngLat.lng });
});

// ---------- 타이머 ----------
let session = null; // { startM, targetM, durationMs, endAt, remainingMs }
let ticker = null;
let lastFollow = 0;
const running = () => !!session;

function setMode(mode) {
  // idle | running | paused
  $("btn-start").hidden = mode !== "idle";
  $("btn-pause").hidden = mode === "idle";
  $("btn-stop").hidden = mode === "idle";
  $("btn-pause").textContent = mode === "paused" ? "계속하기" : "일시정지";
  for (const chip of document.querySelectorAll(".chip")) chip.disabled = mode !== "idle";
  $("btn-dest-change").disabled = mode !== "idle";
  walkerEl.classList.toggle("walking", mode === "running");
}

function start() {
  if (!journey) return openModal("dest-modal");
  const left = journey.route.distance_m - journey.walked_m;
  if (left <= 0) return openModal("dest-modal");
  const sessionM = (WALK_KMH * 1000 * minutes) / 60;
  session = {
    startM: journey.walked_m,
    targetM: Math.min(journey.route.distance_m, journey.walked_m + sessionM),
    speed: sessionM / (minutes * MS_PER_MINUTE), // m/ms
    durationMs: minutes * MS_PER_MINUTE,
    remainingMs: minutes * MS_PER_MINUTE,
  };
  $("status").textContent = `${character.emoji} ${iga(character.name)} 출발했어요! ${character.line}`;
  focusWalker();
  resume();
}

function resume() {
  session.endAt = Date.now() + session.remainingMs;
  clearInterval(ticker);
  ticker = setInterval(tick, 200);
  setMode("running");
  tick();
}

function pause() {
  session.remainingMs = Math.max(0, session.endAt - Date.now());
  clearInterval(ticker);
  setMode("paused");
  $("status").textContent = `${iga(character.name)} 잠깐 쉬는 중이에요.`;
}

function stop() {
  clearInterval(ticker);
  session = null;
  setMode("idle");
  drawJourney();
  resetClock();
  document.title = "걸음모도로";
  $("status").textContent = "이번 걸음은 기록하지 않았어요. 다음엔 끝까지 가 봐요!";
}

function resetClock() {
  $("clock").textContent = formatClock(minutes * MS_PER_MINUTE);
  $("ring-fill").style.strokeDashoffset = RING;
  renderJourney();
}

function currentMeters() {
  const elapsed = session.durationMs - session.remainingMs;
  return Math.min(session.targetM, session.startM + elapsed * session.speed);
}

function tick() {
  session.remainingMs = Math.max(0, session.endAt - Date.now());
  const progress = 1 - session.remainingMs / session.durationMs;
  const d = currentMeters();

  const here = pointAt(path, d).point;
  const ahead = pointAt(path, d + 30).point;
  setWalker(here, ahead);
  setLine("wm-walked", sliceTo(path, d));
  if (Date.now() - lastFollow > 1500) {
    lastFollow = Date.now();
    map.easeTo({ center: here, duration: 1400, easing: (t) => t });
  }

  const clock = formatClock(session.remainingMs);
  $("clock").textContent = clock;
  $("clock-sub").textContent = `${formatDistance(d - session.startM)} 걸음`;
  renderJourney(d);
  $("ring-fill").style.strokeDashoffset = RING * (1 - progress);
  document.title = `${clock} · 걸음모도로`;

  if (session.remainingMs <= 0) finish();
}

function finish() {
  clearInterval(ticker);
  const walked = session.targetM - session.startM;
  journey.walked_m = session.targetM;
  store.set("journey", journey);
  session = null;
  setMode("idle");

  const dayKey = `day:${new Date().toLocaleDateString("sv-SE")}`;
  const today = store.get(dayKey, { minutes: 0, meters: 0 });
  today.minutes += minutes;
  today.meters += Math.round(walked);
  store.set(dayKey, today);

  const arrived = journey.walked_m >= journey.route.distance_m - 1;
  const left = journey.route.distance_m - journey.walked_m;
  const end = path.coords[path.coords.length - 1];
  $("done-emoji").textContent = arrived ? "🏁" : character.emoji;
  $("done-title").textContent = arrived ? `${journey.name} 도착!` : `${formatDistance(walked)} 걸었어요!`;
  $("done-text").textContent = arrived
    ? `${wagwa(character.name)} 함께 ${formatDistance(journey.route.distance_m)}를 걸어왔어요. 정말 수고했어요.`
    : `${journey.name}까지 ${formatDistance(left)} 남았어요. 쉬고 나서 이어 걸어요.`;
  const link = $("done-link");
  link.hidden = !arrived || journey.route.distance_m > 15000;
  link.href = `https://map.kakao.com/link/to/${encodeURIComponent(journey.name)},${end[1]},${end[0]}`;

  document.title = arrived ? "🏁 도착! · 걸음모도로" : "☕ 쉬는 시간 · 걸음모도로";
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  confetti(arrived ? ["🎉", "🏁", "✨", character.emoji] : ["✨", "🌿", character.emoji]);
  openModal("done-modal");

  drawJourney();
  resetClock();
  renderToday();
  $("status").textContent = arrived ? "새 목적지를 정해 볼까요?" : "수고했어요! 이제 쉬는 시간이에요.";
}

// ---------- 축하 효과 ----------
function confetti(emojis) {
  const canvas = $("confetti");
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.scale(dpr, dpr);
  const pieces = Array.from({ length: 40 }, () => ({
    x: Math.random() * innerWidth,
    y: -20 - Math.random() * innerHeight * 0.5,
    vy: 2 + Math.random() * 3,
    vx: -1 + Math.random() * 2,
    r: Math.random() * Math.PI,
    vr: -0.05 + Math.random() * 0.1,
    e: emojis[Math.floor(Math.random() * emojis.length)],
    size: 18 + Math.random() * 14,
  }));
  const startAt = performance.now();
  (function frame(now) {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of pieces) {
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.font = `${p.size}px serif`;
      ctx.fillText(p.e, 0, 0);
      ctx.restore();
    }
    if (now - startAt < 3500) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, innerWidth, innerHeight);
  })(startAt);
}

// ---------- 모달 ----------
function openModal(id) {
  $(id).hidden = false;
  if (id === "dest-modal") setTimeout(() => $("search-input").focus(), 50);
}
function closeModal(id) {
  $(id).hidden = true;
}
for (const btn of document.querySelectorAll("[data-close]")) {
  btn.addEventListener("click", () => closeModal(btn.dataset.close));
}
for (const modal of document.querySelectorAll(".modal")) {
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal(modal.id);
  });
}

function renderCharacterGrid() {
  const grid = $("char-grid");
  grid.innerHTML = "";
  for (const c of CHARACTERS) {
    const btn = document.createElement("button");
    btn.className = `char${c.id === character.id ? " active" : ""}`;
    btn.innerHTML = '<span class="emoji"></span><span class="name"></span>';
    btn.querySelector(".emoji").textContent = c.emoji;
    btn.querySelector(".name").textContent = c.name;
    btn.addEventListener("click", () => {
      character = c;
      store.set("character", c.id);
      renderCharacter();
      renderCharacterGrid();
      renderJourney();
    });
    grid.appendChild(btn);
  }
  const line = document.createElement("p");
  line.className = "char-line";
  line.textContent = `${character.emoji} ${character.name}: ${character.line}`;
  grid.appendChild(line);
}

// ---------- 버튼 연결 ----------
$("btn-start").addEventListener("click", start);
$("btn-pause").addEventListener("click", () => ($("btn-pause").textContent === "일시정지" ? pause() : resume()));
$("btn-stop").addEventListener("click", stop);
$("btn-dest-empty").addEventListener("click", () => openModal("dest-modal"));
$("btn-dest-change").addEventListener("click", () => openModal("dest-modal"));
$("btn-character").addEventListener("click", () => {
  renderCharacterGrid();
  openModal("char-modal");
});
$("btn-style").addEventListener("click", () => {
  styleIndex = (styleIndex + 1) % MAP_STYLES.length;
  const s = MAP_STYLES[styleIndex];
  store.set("mapStyle", s.id);
  map.setStyle(s.url);
  map.easeTo({ pitch: s.pitch, duration: 800 });
  $("status").textContent = `${s.name}로 바꿨어요`;
});
$("btn-overview").addEventListener("click", overview);
$("search-form").addEventListener("submit", searchPlaces);
$("btn-random").addEventListener("click", randomDestination);
$("btn-pick").addEventListener("click", startPicking);
for (const chip of document.querySelectorAll(".chip")) {
  chip.addEventListener("click", () => {
    minutes = Number(chip.dataset.min);
    for (const c of document.querySelectorAll(".chip")) c.classList.toggle("active", c === chip);
    resetClock();
  });
}

// ---------- 시작 ----------
api("/api/config")
  .then((c) => {
    WALK_KMH = c.walking_speed_kmh;
    renderJourney();
  })
  .catch(() => {});

renderCharacter();
updatePadding();
resetClock();
renderToday();
setMode("idle");
if (journey) {
  map.once("load", () => focusWalker(false));
  $("status").textContent = `${journey.name}까지 이어서 걸어요`;
} else {
  $("status").textContent = "목적지를 정하고 집중을 시작해요";
  getPosition().then((p) => map.jumpTo({ center: [p.lon, p.lat] }));
}
