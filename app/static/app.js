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
  { id: "positron", name: "파스텔", url: "https://tiles.openfreemap.org/styles/positron", pitch: 45 },
  { id: "bright", name: "선명", url: "https://tiles.openfreemap.org/styles/bright", pitch: 50 },
];

const $ = (id) => document.getElementById(id);
// 받침에 따라 조사를 골라요: josa("펭귄", "이", "가") → "이"
const josa = (word, withBatchim, without) => {
  const c = word.charCodeAt(word.length - 1);
  return c >= 0xac00 && c <= 0xd7a3 && (c - 0xac00) % 28 ? withBatchim : without;
};
const iga = (w) => `${w}${josa(w, "이", "가")}`;
const wagwa = (w) => `${w}${josa(w, "과", "와")}`;
const RING = 2 * Math.PI * 92;

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
  set(key, value, { sync = true } = {}) {
    try {
      localStorage.setItem(`walkmodoro:${key}`, JSON.stringify(value));
    } catch {
      // 시크릿 모드 등 저장이 막힌 곳에서는 조용히 넘어가요.
    }
    // 로그인 중이면 서버에도 저장해요 (잠깐 모았다가 한 번에)
    if (sync && key !== "syncedRev") scheduleSync();
  },
  keys(prefix) {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith(`walkmodoro:${prefix}`))
        .map((k) => k.slice("walkmodoro:".length));
    } catch {
      return [];
    }
  },
};

let character = CHARACTERS.find((c) => c.id === store.get("character", "turtle")) || CHARACTERS[0];
let styleIndex = Math.max(0, MAP_STYLES.findIndex((s) => s.id === store.get("mapStyle", "liberty")));
let journey = store.get("journey", null);
const PRESET_MINUTES = [25, 50];
const clampMinutes = (m) => Math.min(180, Math.max(1, Math.round(Number(m) || 25)));
let minutes = clampMinutes(store.get("minutes", 25));
// ---------- 나만의 아바타 (아이템 목록은 서버의 app/avatar.py) ----------
const CATALOG = JSON.parse($("avatar-catalog").textContent);
const ITEMS = Object.fromEntries(CATALOG.items.map((i) => [i.id, i]));
const SLOTS = [
  { id: "hair", name: "머리" },
  { id: "top", name: "옷" },
  { id: "hat", name: "모자" },
  { id: "neck", name: "목" },
  { id: "bag", name: "가방" },
  { id: "color", name: "색" },
];
const DEFAULT_OUTFIT = {
  hair: "hair-short",
  top: "top-tee",
  hat: null,
  neck: null,
  bag: null,
  color: "color-mint",
  skin: CATALOG.skin_tones[1],
  hairColor: CATALOG.hair_colors[0],
  topColor: CATALOG.top_colors[0],
};
// 저장된 옷차림 중 지금 목록에 없는 값은 기본값으로 돌려놔요.
function cleanOutfit(saved) {
  const o = { ...DEFAULT_OUTFIT, ...(saved || {}) };
  for (const slot of ["hair", "top", "hat", "neck", "bag", "color"]) {
    if (o[slot] !== null && ITEMS[o[slot]]?.slot !== slot) o[slot] = DEFAULT_OUTFIT[slot];
  }
  if (!CATALOG.skin_tones.includes(o.skin)) o.skin = DEFAULT_OUTFIT.skin;
  if (!CATALOG.hair_colors.includes(o.hairColor)) o.hairColor = DEFAULT_OUTFIT.hairColor;
  if (!CATALOG.top_colors.includes(o.topColor)) o.topColor = DEFAULT_OUTFIT.topColor;
  return o;
}
let outfit = cleanOutfit(store.get("outfit", {}));
let owned = store.get("owned", []);
let coins = store.get("coins", null);
if (coins === null) {
  // 처음 만난 날: 지금까지 걸은 거리만큼 코인을 선물해요.
  const meters = store.keys("day:").reduce((sum, k) => sum + (store.get(k, {}).meters || 0), 0);
  coins = Math.floor(meters / CATALOG.meters_per_coin);
  store.set("coins", coins, { sync: false });
}
let closetSlot = "hair";

let me = null; // 로그인 정보 (/api/me)
let syncTimer = null;

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
  const pad = (n) => String(n).padStart(2, "0");
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(total % 60)}` : `${pad(m)}:${pad(total % 60)}`;
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
  // 지도 크게 보기에서는 아래 카드만큼 비워 두고, 집중 화면에서는 가운데 그대로
  const card = document.querySelector(".map-card");
  const mapView = document.body.classList.contains("view-map");
  map.setPadding({ top: 70, bottom: mapView ? card.offsetHeight + 14 : 0, left: 0, right: 0 });
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
  if (!body.firstChild) paintFigure(body);
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
  if (!journey) {
    $("dest-name").textContent = "목적지를 정해 주세요";
    $("dest-pct").textContent = "";
    $("journey-name").textContent = "목적지 없음";
    $("journey-mode").textContent = "";
    $("journey-text").textContent = "돌아가서 목적지를 정해 주세요";
    $("journey-bar").style.width = "0";
    if (!running()) $("clock-sub").textContent = "집중 준비";
    return;
  }
  const walkedM = liveMeters ?? journey.walked_m;
  const pct = Math.min(100, (walkedM / journey.route.distance_m) * 100 || 0);
  const pctText = `${pct.toFixed(pct < 1 ? 1 : 0)}%`;
  const left = Math.max(0, journey.route.distance_m - walkedM);
  $("dest-name").textContent = journey.name;
  $("dest-pct").textContent = left <= 0 ? "도착" : pctText;
  $("journey-name").textContent = journey.name;
  $("journey-bar").style.width = `${pct}%`;
  $("journey-text").textContent =
    left <= 0
      ? "도착했어요! 새 목적지를 정해 볼까요?"
      : `${formatDistance(journey.route.distance_m)} 중 ${formatDistance(walkedM)} · ${pctText}`;
  $("journey-mode").textContent =
    journey.route.mode === "road" ? `${wagwa(character.name)} 가는 길` : `${wagwa(character.name)} 가는 길 · 직선`;
  const sessionM = (WALK_KMH * 1000 * minutes) / 60;
  if (!running()) {
    $("clock-sub").textContent = left > 0 ? `이번 집중으로 ${formatDistance(Math.min(sessionM, left))}` : "도착 완료";
  }
}

function todayRecord() {
  return store.get(`day:${new Date().toLocaleDateString("sv-SE")}`, { minutes: 0, meters: 0, sessions: 0 });
}

function renderToday() {
  const today = todayRecord();
  $("stat-minutes").textContent = `${today.minutes}분`;
  $("stat-meters").textContent = formatDistance(today.meters);
  $("stat-sessions").textContent = `${today.sessions ?? Math.round(today.minutes / 25)}번`;
}

const hasItem = (item) => (item.price === 0 && !item.premium) || owned.includes(item.id);

// 사람 아바타(SVG)를 그리고, 같이 걷는 친구(동물)를 발치에 둬요. 크기는 글자 크기(em)를 따라가요.
function paintFigure(el) {
  el.classList.add("figure");
  el.innerHTML = `${Avatar.svg(outfit)}<span class="fig-pet"></span>`;
  el.querySelector(".fig-pet").textContent = character.emoji;
}

function renderCharacter() {
  const color = ITEMS[outfit.color]?.icon || "#e2f5ea";
  for (const id of ["hero-avatar", "closet-preview"]) {
    const box = $(id);
    box.style.setProperty("--av-color", color);
    box.innerHTML = '<span class="hero-char"></span>';
    paintFigure(box.firstChild);
  }
  if (walkerShown) paintFigure(walkerEl.querySelector(".walker-body"));
  $("coin-count").textContent = coins.toLocaleString();
}

const PALETTES = [
  { key: "skin", name: "피부", colors: CATALOG.skin_tones },
  { key: "hairColor", name: "머리색", colors: CATALOG.hair_colors },
  { key: "topColor", name: "옷 색", colors: CATALOG.top_colors },
];

function renderCloset() {
  $("closet-coins").textContent = coins.toLocaleString();
  const tabs = $("slot-tabs");
  tabs.innerHTML = "";
  for (const slot of SLOTS) {
    const btn = document.createElement("button");
    btn.className = `chip${slot.id === closetSlot ? " active" : ""}`;
    btn.textContent = slot.name;
    btn.addEventListener("click", () => {
      closetSlot = slot.id;
      renderCloset();
    });
    tabs.appendChild(btn);
  }

  // '색' 칸: 피부·머리색·옷 색은 코인 없이 마음대로 골라요.
  const palette = $("palette");
  palette.innerHTML = "";
  palette.hidden = closetSlot !== "color";
  if (closetSlot === "color") {
    for (const p of PALETTES) {
      const row = document.createElement("div");
      row.className = "palette-row";
      row.innerHTML = '<span class="palette-name"></span><div class="swatches"></div>';
      row.querySelector(".palette-name").textContent = p.name;
      for (const c of p.colors) {
        const sw = document.createElement("button");
        sw.className = `swatch-btn${outfit[p.key] === c ? " active" : ""}`;
        sw.style.background = c;
        sw.setAttribute("aria-label", `${p.name} ${c}`);
        sw.addEventListener("click", () => {
          outfit = { ...outfit, [p.key]: c };
          store.set("outfit", outfit);
          renderCharacter();
          renderCloset();
        });
        row.querySelector(".swatches").appendChild(sw);
      }
      palette.appendChild(row);
    }
  }

  const grid = $("item-grid");
  grid.innerHTML = "";
  const items = CATALOG.items.filter((i) => i.slot === closetSlot);
  if (["hat", "neck", "bag"].includes(closetSlot)) {
    items.unshift({ id: null, slot: closetSlot, name: "없음", icon: "", price: 0 });
  }
  for (const item of items) {
    const btn = document.createElement("button");
    btn.dataset.id = item.id ?? "";
    const worn = outfit[item.slot] === item.id;
    const mine = item.id === null || hasItem(item);
    btn.className = `item${worn ? " active" : ""}${mine ? "" : " locked"}${item.premium ? " premium" : ""}`;
    btn.innerHTML = '<span class="item-icon"></span><span class="name"></span><span class="tag"></span>';
    const icon = btn.querySelector(".item-icon");
    if (item.slot === "color") {
      icon.classList.add("swatch");
      icon.style.background = item.icon;
    } else {
      // 지금 모습에 이 아이템을 입혀 본 미리보기
      icon.classList.add("try-on");
      icon.innerHTML = Avatar.svg({ ...outfit, [item.slot]: item.id });
    }
    btn.querySelector(".name").textContent = item.name;
    btn.querySelector(".tag").textContent = worn
      ? "착용 중"
      : mine
        ? "입기"
        : item.premium
          ? "곧 만나요"
          : `🐾 ${item.price}`;
    btn.addEventListener("click", () => chooseItem(item, mine));
    grid.appendChild(btn);
  }
}

function chooseItem(item, mine) {
  if (!mine) {
    if (item.premium) {
      $("status").textContent = `${item.icon} ${item.name}${josa(item.name, "은", "는")} 특별 아이템이라 곧 만나요!`;
      return flash(item.id, "곧 만나요");
    }
    if (coins < item.price) {
      return flash(item.id, `🐾 ${item.price - coins}개 더`);
    }
    coins -= item.price;
    owned = [...owned, item.id];
    store.set("coins", coins);
    store.set("owned", owned);
    confetti([item.icon.startsWith("#") ? "🐾" : item.icon, "✨", "🐾"]);
  }
  outfit = { ...outfit, [item.slot]: item.id };
  store.set("outfit", outfit);
  renderCharacter();
  renderCloset();
}

// 살 수 없는 아이템을 누르면 잠깐 흔들고 이유를 보여줘요.
function flash(id, text) {
  renderCloset();
  const target = $("item-grid").querySelector(`[data-id="${id}"]`);
  if (!target) return;
  target.querySelector(".tag").textContent = text;
  target.classList.add("shake");
}

function setView(view, follow = true) {
  // focus: 캐릭터와 타이머 중심(지도는 흐리게) / map: 지도 크게 보기
  document.body.classList.toggle("view-focus", view === "focus");
  document.body.classList.toggle("view-map", view === "map");
  $("btn-view").textContent = view === "map" ? "⏱️" : "🗺️";
  $("btn-view").setAttribute("aria-label", view === "map" ? "타이머로 돌아가기" : "지도 크게 보기");
  requestAnimationFrame(() => {
    updatePadding();
    if (follow && journey) focusWalker();
  });
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
    setView("map", false);
    setTimeout(overview, 450);
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
    const trip = await api(`/api/trip?lat=${pos.lat}&lon=${pos.lon}&minutes=${Math.min(60, Math.max(5, minutes))}`);
    const d = trip.destination;
    await setJourney(d.name, d.kind, d);
  } catch {
    $("status").textContent = "여행지를 고르지 못했어요. 잠시 후 다시 시도해 주세요.";
  }
}

let picking = false;
function startPicking() {
  closeModal("dest-modal");
  setView("map", false);
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
  $("minute-chips").hidden = mode !== "idle";
  $("dest-chip").disabled = mode !== "idle";
  walkerEl.classList.toggle("walking", mode === "running");
  document.querySelector(".avatar").classList.toggle("walking", mode === "running");
}

function start() {
  if (!journey) return openModal("dest-modal");
  const left = journey.route.distance_m - journey.walked_m;
  if (left <= 0) return openModal("dest-modal");
  const sessionM = (WALK_KMH * 1000 * minutes) / 60;
  session = {
    startM: journey.walked_m,
    // 목적지까지 100m도 안 남으면 그냥 도착으로 쳐요 (49m 남기고 끝나면 아쉬우니까)
    targetM:
      journey.route.distance_m - (journey.walked_m + sessionM) < 100
        ? journey.route.distance_m
        : journey.walked_m + sessionM,
    speed: sessionM / (minutes * MS_PER_MINUTE), // m/ms
    durationMs: minutes * MS_PER_MINUTE,
    remainingMs: minutes * MS_PER_MINUTE,
  };
  $("status").textContent = `${iga(character.name)} 출발했어요! ${character.line}`;
  setView("focus");
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
  const today = store.get(dayKey, { minutes: 0, meters: 0, sessions: 0 });
  today.sessions = (today.sessions ?? 0) + 1;
  today.minutes += minutes;
  today.meters += Math.round(walked);
  store.set(dayKey, today);

  const arrived = journey.walked_m >= journey.route.distance_m - 1;
  const earned = Math.floor(walked / CATALOG.meters_per_coin) + (arrived ? CATALOG.arrival_bonus : 0);
  coins += earned;
  store.set("coins", coins);
  renderCharacter();
  $("done-coins").hidden = earned <= 0;
  $("done-coins").textContent = `🐾 발자국 코인 +${earned}`;
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

function renderSettings() {
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
      renderSettings();
      renderJourney();
      $("status").textContent = `${c.emoji} ${c.line}`;
    });
    grid.appendChild(btn);
  }

  const styles = $("style-options");
  styles.innerHTML = "";
  MAP_STYLES.forEach((st, i) => {
    const btn = document.createElement("button");
    btn.className = `chip${i === styleIndex ? " active" : ""}`;
    btn.textContent = st.name;
    btn.addEventListener("click", () => {
      if (i === styleIndex) return;
      styleIndex = i;
      store.set("mapStyle", st.id);
      map.setStyle(st.url);
      map.easeTo({ pitch: st.pitch, duration: 800 });
      renderSettings();
    });
    styles.appendChild(btn);
  });
  renderCloset();
  renderToday();
}

// ---------- 버튼 연결 ----------
$("btn-start").addEventListener("click", start);
$("btn-pause").addEventListener("click", () => ($("btn-pause").textContent === "일시정지" ? pause() : resume()));
$("btn-stop").addEventListener("click", stop);
$("dest-chip").addEventListener("click", () => openModal("dest-modal"));
$("btn-settings").addEventListener("click", () => {
  renderSettings();
  openModal("settings-modal");
});
$("btn-coins").addEventListener("click", () => {
  renderSettings();
  openModal("settings-modal");
  requestAnimationFrame(() => $("closet").scrollIntoView({ behavior: "smooth", block: "start" }));
});
$("btn-view").addEventListener("click", () =>
  setView(document.body.classList.contains("view-map") ? "focus" : "map"),
);
$("btn-back").addEventListener("click", () => setView("focus"));
$("btn-overview").addEventListener("click", overview);
$("search-form").addEventListener("submit", searchPlaces);
$("btn-random").addEventListener("click", randomDestination);
$("btn-pick").addEventListener("click", startPicking);
// ---------- 집중 시간 ----------
function setMinutes(m) {
  minutes = clampMinutes(m);
  store.set("minutes", minutes);
  renderMinuteChips();
  resetClock();
}

function renderMinuteChips() {
  const custom = !PRESET_MINUTES.includes(minutes);
  for (const c of document.querySelectorAll("#minute-chips .chip[data-min]")) {
    c.classList.toggle("active", Number(c.dataset.min) === minutes);
  }
  $("chip-custom").classList.toggle("active", custom);
  $("chip-custom").textContent = custom ? `${minutes}분 ✎` : "직접 ✎";
}

const formatMinutes = (m) => (m >= 60 ? `${Math.floor(m / 60)}시간${m % 60 ? ` ${m % 60}분` : ""}` : `${m}분`);

let draftMinutes = minutes;
function renderTimePicker() {
  $("time-value").textContent = draftMinutes;
  $("time-range").value = draftMinutes;
  const meters = (WALK_KMH * 1000 * draftMinutes) / 60;
  $("time-hint").textContent = `${formatMinutes(draftMinutes)} 동안 약 ${formatDistance(meters)} 걸어요`;
  for (const c of document.querySelectorAll("#time-presets .chip")) {
    c.classList.toggle("active", Number(c.dataset.min) === draftMinutes);
  }
}

for (const chip of document.querySelectorAll("#minute-chips .chip[data-min]")) {
  chip.addEventListener("click", () => setMinutes(chip.dataset.min));
}
$("chip-custom").addEventListener("click", () => {
  draftMinutes = minutes;
  renderTimePicker();
  openModal("time-modal");
});
$("time-range").addEventListener("input", (e) => {
  draftMinutes = clampMinutes(e.target.value);
  renderTimePicker();
});
$("time-minus").addEventListener("click", () => {
  draftMinutes = clampMinutes(draftMinutes - 1);
  renderTimePicker();
});
$("time-plus").addEventListener("click", () => {
  draftMinutes = clampMinutes(draftMinutes + 1);
  renderTimePicker();
});
for (const chip of document.querySelectorAll("#time-presets .chip")) {
  chip.addEventListener("click", () => {
    draftMinutes = clampMinutes(chip.dataset.min);
    renderTimePicker();
  });
}
$("time-ok").addEventListener("click", () => {
  setMinutes(draftMinutes);
  closeModal("time-modal");
  $("status").textContent = `${formatMinutes(minutes)} 집중으로 정했어요`;
});

// ---------- 로그인과 서버 저장 ----------
const PROVIDERS = {
  kakao: { label: "카카오로 시작하기", icon: "💬" },
  google: { label: "Google로 시작하기", icon: "🔵" },
};

function collectState() {
  const days = {};
  for (const key of store.keys("day:")) days[key.slice(4)] = store.get(key, null);
  return {
    character: character.id,
    mapStyle: MAP_STYLES[styleIndex].id,
    minutes,
    journey,
    days,
    avatar: { coins, owned, outfit },
  };
}

function applyState(state) {
  const quiet = { sync: false };
  if (state.character) store.set("character", state.character, quiet);
  if (state.mapStyle) store.set("mapStyle", state.mapStyle, quiet);
  if (state.minutes) store.set("minutes", state.minutes, quiet);
  store.set("journey", state.journey ?? null, quiet);
  for (const [day, record] of Object.entries(state.days || {})) store.set(`day:${day}`, record, quiet);
  if (state.avatar) {
    store.set("coins", state.avatar.coins ?? 0, quiet);
    store.set("owned", state.avatar.owned ?? [], quiet);
    store.set("outfit", state.avatar.outfit ?? DEFAULT_OUTFIT, quiet);
  }
}

function scheduleSync() {
  if (!me?.user) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncNow, 800);
}

async function syncNow() {
  if (!me?.user) return;
  try {
    const res = await fetch("/api/me/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ data: collectState() }),
    });
    if (res.ok) store.set("syncedRev", (await res.json()).rev);
  } catch {
    // 네트워크가 끊겨도 기록은 브라우저에 남아 있어요. 다음 저장 때 다시 올려요.
  }
}

function renderAccount() {
  const box = $("account");
  box.innerHTML = "";
  if (!me || (!me.user && !me.providers.length)) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  if (me.user) {
    const row = document.createElement("div");
    row.className = "account-row";
    row.innerHTML = '<div><p class="account-name"></p><p class="muted small">기록이 계정에 저장되고 있어요</p></div><button class="pill">로그아웃</button>';
    row.querySelector(".account-name").textContent = `${me.user.nickname || "걷는 친구"}님`;
    row.querySelector("button").addEventListener("click", async () => {
      await fetch("/auth/logout", { method: "POST" });
      me.user = null;
      store.set("syncedRev", 0);
      renderAccount();
    });
    box.appendChild(row);

    // 계정 삭제: 실수로 누르지 않게 두 번 눌러야 지워져요.
    const del = document.createElement("button");
    del.className = "text-btn small danger";
    del.textContent = "계정 삭제";
    let armed = false;
    del.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        del.textContent = "한 번 더 누르면 계정과 서버 기록이 모두 지워져요";
        setTimeout(() => {
          armed = false;
          del.textContent = "계정 삭제";
        }, 5000);
        return;
      }
      const res = await fetch("/api/me", { method: "DELETE" });
      if (!res.ok) {
        del.textContent = "삭제하지 못했어요. 다시 시도해 주세요.";
        return;
      }
      me.user = null;
      store.set("syncedRev", 0);
      renderAccount();
      $("status").textContent = "계정을 삭제했어요. 이 기기의 기록은 그대로 남아 있어요.";
    });
    box.appendChild(del);
    return;
  }
  const intro = document.createElement("p");
  intro.className = "small";
  intro.innerHTML = "<b>로그인하면</b> 휴대폰을 바꿔도 여정과 기록이 이어져요";
  box.appendChild(intro);
  for (const id of me.providers) {
    const a = document.createElement("a");
    a.className = `login-btn ${id}`;
    a.href = `/auth/${id}/login`;
    a.textContent = `${PROVIDERS[id].icon} ${PROVIDERS[id].label}`;
    box.appendChild(a);
  }
}

async function initAccount() {
  const params = new URLSearchParams(location.search);
  if (params.has("login")) {
    params.delete("login");
    const rest = params.toString();
    history.replaceState(null, "", location.pathname + (rest ? `?${rest}` : ""));
  }
  try {
    me = await api("/api/me");
  } catch {
    return;
  }
  renderAccount();
  if (!me.user) return;
  if (me.state && me.rev !== store.get("syncedRev", 0)) {
    // 다른 기기에서 저장한 최신 기록이 있으면 그걸로 바꾸고 다시 그려요.
    applyState(me.state);
    store.set("syncedRev", me.rev);
    location.reload();
    return;
  }
  if (!me.state) syncNow(); // 처음 로그인: 지금까지의 기록을 계정에 올려요
  $("status").textContent = `${me.user.nickname || "걷는 친구"}님, 오늘도 같이 걸어요`;
}

// ---------- 앱 설치(PWA) ----------
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

// ---------- 시작 ----------
api("/api/config")
  .then((c) => {
    WALK_KMH = c.walking_speed_kmh;
    renderJourney();
  })
  .catch(() => {});

const loginResult = new URLSearchParams(location.search).get("login");
initAccount().then(() => {
  if (loginResult === "fail") $("status").textContent = "로그인에 실패했어요. 다시 시도해 주세요.";
});

renderCharacter();
renderMinuteChips();
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
