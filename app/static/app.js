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
// 걷기(walk)와 비행기 여행(fly)은 여정을 따로 저장해요. 바꿔도 다른 쪽 진행은 그대로예요.
const FLIGHTS = JSON.parse($("flight-catalog").textContent);
let travelMode = store.get("travelMode", "walk") === "fly" ? "fly" : "walk";
const journeyKey = () => (travelMode === "fly" ? "flight" : "journey");
let journey = store.get(journeyKey(), null);
const flying = () => travelMode === "fly";
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
  maxPitch: 85,
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
map.on("style.load", () => {
  for (const k of Object.keys(buildingOpacity)) delete buildingOpacity[k];
  applyLabels();
  applyProjection();
  addOverlays();
  applySky();
  if (streetOn()) setStreetBuildings(true);
});

// 지명 줄이기: '간단히'면 나라·도시·동네 이름만 남기고 가게·도로·번지 이름은 숨겨요.
let labelMode = store.get("labels", "simple");
const KEEP_LABEL = /(country|continent|state|city|capital|town|village|place_(?!other))/;
function applyLabels() {
  const style = map.getStyle?.();
  if (!style) return;
  for (const layer of style.layers) {
    if (layer.type !== "symbol" || layer.id.startsWith("wm-")) continue;
    const keep = labelMode === "all" || KEEP_LABEL.test(layer.id);
    map.setLayoutProperty(layer.id, "visibility", keep ? "visible" : "none");
  }
}

// 하늘과 지평선 안개: 땅 가까이 기울였을 때 수평선이 자연스럽게 보여요.
function applySky() {
  if (!map.setSky) return;
  try {
    const p = PHASES[phase];
    const gloomy = ["cloudy", "rain", "storm", "fog", "snow"].includes(weatherNow?.kind);
    map.setSky({
      "sky-color": gloomy && phase === "day" ? "#cdd6df" : p.sky,
      "sky-horizon-blend": 0.6,
      "horizon-color": p.horizon,
      "horizon-fog-blend": weatherNow?.kind === "fog" ? 0.95 : 0.7,
      "fog-color": p.fog,
      "fog-ground-blend": weatherNow?.kind === "fog" ? 0.75 : 0.35,
      // 여행 모드에서 멀리 올라가면 지구 둘레에 푸른 대기가 보여요
      "atmosphere-blend": flying() ? ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 8, 0] : 0,
    });
  } catch {
    // 하늘을 지원하지 않는 환경이면 그냥 넘어가요.
  }
}

// 아래 카드에 가리지 않도록 지도의 '가운데'를 카드 위쪽으로 올려요.
function updatePadding() {
  // 지도 크게 보기에서는 아래 카드만큼 비워 두고, 집중 화면에서는 가운데 그대로
  const card = document.querySelector(".map-card");
  const mapView = document.body.classList.contains("view-map");
  const tabbar = document.querySelector(".tabbar").offsetHeight;
  const bottom = mapView ? card.offsetHeight + tabbar + 14 : 0;
  // 거리 시점에서는 캐릭터가 화면 아래쪽에 서고 앞길이 넓게 보이도록 위를 더 비워요.
  const top = streetOn() ? Math.round(innerHeight * 0.38) : 70;
  map.setPadding({ top, bottom, left: 0, right: 0 });
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
  if (flying()) {
    // ✈️ 그림은 오른쪽 위(45°)를 보고 있어서, 가는 방향에 맞춰 돌려요.
    if (nextLngLat) {
      const deg = bearingBetween(lngLat, nextLngLat) - map.getBearing() - 45;
      body.querySelector(".plane")?.style.setProperty("transform", `rotate(${deg}deg)`);
    }
    return;
  }
  // 거리 시점에서는 늘 진행 방향을 보고 있으니 뒤집지 않아요.
  if (streetOn()) body.classList.remove("flip");
  // 위에서 볼 때는 오른쪽(동쪽)으로 갈 때 뒤집어서 가는 방향을 보게 해요.
  else if (nextLngLat) body.classList.toggle("flip", nextLngLat[0] > lngLat[0]);
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
  destMarker = new maplibregl.Marker({ element: pinElement(flying() ? "🛬" : "🏁", journey.name), anchor: "bottom" })
    .setLngLat(path.coords[path.coords.length - 1])
    .addTo(map);
  const here = pointAt(path, journey.walked_m).point;
  const ahead = pointAt(path, journey.walked_m + 30).point;
  setWalker(here, ahead);
}

function focusWalker(animate = true) {
  if (!journey || !path || streetOn()) return;
  const here = pointAt(path, session ? liveMeters() : journey.walked_m).point;
  const s = MAP_STYLES[styleIndex];
  if (flying()) return flyCamera(animate);
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

// ---------- 걷기 / 비행기 여행 ----------
function speedPerMin() {
  // 1분에 몇 m 가는지: 걷기는 걷는 속도, 비행은 실제 비행시간에 맞춘 속도
  if (flying() && journey) return journey.route.distance_m / journey.flight_min;
  return (WALK_KMH * 1000) / 60;
}

function saveJourney() {
  store.set(journeyKey(), journey);
}

// 비행 카메라: 출발 전엔 공항 활주로, 나는 중엔 지구본 위, 도착하면 도착 도시
const CRUISE_ZOOM = 2.3; // 지구가 둥글게 보이는 높이
let takeoffUntil = 0;
function flyCamera(animate = true) {
  if (!journey || !path || Date.now() < takeoffUntil) return;
  const d = session ? liveMeters() : journey.walked_m;
  const duration = animate ? 1600 : 0;
  lastFollow = Date.now() + duration + 100;
  if (d <= 0) {
    map.easeTo({ center: path.coords[0], zoom: 12.6, pitch: 50, bearing: bearingBetween(path.coords[0], path.coords[4]), duration });
  } else if (d >= journey.route.distance_m - 1) {
    map.easeTo({ center: path.coords.at(-1), zoom: 10.5, pitch: 40, bearing: 0, duration });
  } else {
    map.easeTo({ center: pointAt(path, d).point, zoom: CRUISE_ZOOM, pitch: 0, bearing: 0, duration });
  }
}

// 활주로에서 출발해 하늘로 올라가며 지구가 보일 때까지 멀어져요.
function takeOff() {
  $("status").textContent = `🛫 ${FLIGHTS.origin.name}공항 활주로를 달려요... 곧 이륙!`;
  lastFollow = Date.now() + 9000;
  takeoffUntil = Date.now() + 9000;
  map.easeTo({ center: path.coords[0], zoom: 12.6, pitch: 50, bearing: bearingBetween(path.coords[0], path.coords[4]), duration: 800 });
  setTimeout(() => {
    if (!session) return;
    $("status").textContent = `✈️ 이륙했어요! ${journey.name}까지 지구 위를 날아가요`;
    map.flyTo({ center: pointAt(path, liveMeters()).point, zoom: CRUISE_ZOOM, pitch: 0, bearing: 0, duration: 6500, curve: 1.2 });
  }, 2500);
}

function applyProjection() {
  try {
    map.setProjection({ type: flying() ? "globe" : "mercator" });
  } catch {
    // 오래된 브라우저에서는 평평한 지도로 그대로 보여요.
  }
}

function openDestPicker() {
  renderRandomKm();
  if (flying()) {
    renderFlights();
    return openModal("fly-modal");
  }
  openModal("dest-modal");
}

// 인천에서 도시까지 지구 곡면을 따라 그린 하늘길. 날짜변경선을 넘어도 끊기지 않게 경도를 이어 붙여요.
function flightPath(from, to, steps = 256) {
  const rad = Math.PI / 180;
  const [lat1, lon1, lat2, lon2] = [from.lat * rad, from.lon * rad, to.lat * rad, to.lon * rad];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2));
  const coords = [];
  let prev = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const a = Math.sin((1 - f) * d) / Math.sin(d);
    const b = Math.sin(f * d) / Math.sin(d);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    let lon = Math.atan2(y, x) / rad;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) / rad;
    if (prev !== null) while (lon - prev > 180) lon -= 360;
    if (prev !== null) while (prev - lon > 180) lon += 360;
    prev = lon;
    coords.push([lon, lat]);
  }
  return coords;
}

function renderFlights() {
  const list = $("fly-list");
  list.innerHTML = "";
  for (const c of FLIGHTS.cities) {
    const li = document.createElement("li");
    const sessions = Math.max(1, Math.ceil(c.minutes / minutes));
    li.innerHTML =
      '<button type="button"><span class="fly-flag"></span><span class="fly-main"><b></b><span class="addr"></span></span><span class="fly-time"></span></button>';
    li.querySelector(".fly-flag").textContent = c.flag;
    li.querySelector("b").textContent = c.name;
    li.querySelector(".addr").textContent = `${c.country} · ${c.code} · ${minutes}분 집중 ${sessions}번`;
    li.querySelector(".fly-time").textContent = formatMinutes(c.minutes);
    li.querySelector("button").addEventListener("click", () => setFlight(c));
    list.appendChild(li);
  }
}

function setFlight(city) {
  closeModal("fly-modal");
  const coords = flightPath(FLIGHTS.origin, city);
  const built = buildPath(coords);
  journey = {
    kind: "fly",
    name: city.name,
    country: city.country,
    flag: city.flag,
    code: city.code,
    flight_min: city.minutes,
    route: { coordinates: coords, distance_m: Math.round(built.total), mode: "flight" },
    walked_m: 0,
    createdAt: Date.now(),
  };
  path = built;
  saveJourney();
  drawJourney();
  renderJourney();
  setView("map", false);
  // 하늘길 전체를 먼저 보여주고, 출발할 공항으로 내려가요.
  setTimeout(overview, 450);
  setTimeout(() => !session && flyCamera(), 3200);
  const sessions = Math.ceil(city.minutes / minutes);
  $("status").textContent = `✈️ ${city.name}까지 ${formatMinutes(city.minutes)} 비행! ${minutes}분 집중을 ${sessions}번 하면 도착해요`;
}

function setTravelMode(mode) {
  if (session || mode === travelMode) return;
  saveJourney();
  travelMode = mode;
  store.set("travelMode", mode, { sync: false });
  journey = store.get(journeyKey(), null);
  path = journey ? buildPath(journey.route.coordinates) : null;
  if (flying() && streetMode) setStreetMode(false, false);
  document.body.classList.toggle("fly", flying());
  applyProjection();
  applySky();
  renderModeSwitch();
  if (walkerShown) paintFigure(walkerEl.querySelector(".walker-body"));
  drawJourney();
  renderJourney();
  resetClock();
  if (journey) focusWalker();
  else if (flying()) map.easeTo({ center: [FLIGHTS.origin.lon, FLIGHTS.origin.lat], zoom: 11.5, pitch: 40, bearing: 0, duration: 1000 });
  $("status").textContent = flying()
    ? journey
      ? `${journey.name}까지 이어서 날아요`
      : "✈️ 어느 나라로 날아갈까요? 목적지를 골라 주세요"
    : journey
      ? `${journey.name}까지 이어서 걸어요`
      : "목적지를 정하고 집중을 시작해요";
  $("dest-flag").textContent = flying() ? "✈️" : "🏁";
}

function renderModeSwitch() {
  for (const b of document.querySelectorAll("#mode-switch .mode-card")) {
    const on = b.dataset.mode === travelMode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", on);
    b.disabled = !!session;
  }
}

// 모드 카드를 누르면 그 모드로 바뀌고 지도에서 바로 보여줘요. 목적지가 없으면 고르는 창을 열어요.
function onModeTap(mode) {
  if (session) return;
  setTravelMode(mode);
  setView("map", false);
  if (!journey) setTimeout(openDestPicker, 350);
  else setTimeout(() => focusWalker(), 50);
}

// ---------- 🎧 배경 소리 ----------
let soundId = store.get("sound", null);
let soundVolume = store.get("soundVolume", 0.6);
Sound.setVolume(soundVolume);

function renderSound() {
  const on = Sound.playing();
  const info = Sound.SOUNDS.find((x) => x.id === on);
  $("sound-icon").textContent = info ? info.icon : "🎧";
  $("sound-label").textContent = info ? "켜짐" : "소리";
  $("sound-btn").classList.toggle("on", !!info);
  const box = $("sound-options");
  box.innerHTML = "";
  for (const opt of [{ id: null, icon: "🔇", name: "끄기" }, ...Sound.SOUNDS]) {
    const b = document.createElement("button");
    b.className = `sound-option${opt.id === on ? " active" : ""}`;
    b.innerHTML = '<span class="sound-emoji"></span><span></span>';
    b.firstChild.textContent = opt.icon;
    b.lastChild.textContent = opt.name;
    b.addEventListener("click", () => chooseSound(opt.id));
    box.appendChild(b);
  }
  $("sound-volume").value = soundVolume;
}

function chooseSound(id) {
  soundId = id;
  store.set("sound", id, { sync: false });
  if (id) Sound.play(id);
  else Sound.stop();
  renderSound();
}

$("sound-btn").addEventListener("click", () => {
  renderSound();
  openModal("sound-modal");
});
$("sound-volume").addEventListener("input", (e) => {
  soundVolume = Number(e.target.value);
  store.set("soundVolume", soundVolume, { sync: false });
  Sound.setVolume(soundVolume);
});

// ---------- 🎲 랜덤 목적지 ----------
const RANDOM_KMS = [1, 3, 5, 10, 20];
let randomKm = store.get("randomKm", 3);
function renderRandomKm() {
  const box = $("random-km");
  box.innerHTML = "";
  for (const km of RANDOM_KMS) {
    const b = document.createElement("button");
    b.className = `chip${km === randomKm ? " active" : ""}`;
    b.textContent = `${km}km`;
    b.addEventListener("click", () => {
      randomKm = km;
      store.set("randomKm", km, { sync: false });
      renderRandomKm();
    });
    box.appendChild(b);
  }
  const walkMin = Math.round((randomKm / WALK_KMH) * 60);
  $("btn-random").textContent = `${randomKm}km 안의 명소 뽑기 · 걸어서 최대 ${formatMinutes(walkMin)}`;
}

function rollDice() {
  if (session) return;
  if (flying()) {
    const choices = FLIGHTS.cities.filter((c) => c.name !== journey?.name);
    return setFlight(choices[Math.floor(Math.random() * choices.length)]);
  }
  randomDestination();
}

// ---------- 거리 걷기 시점 (3인칭) ----------
// 카메라를 땅 가까이 눕혀 캐릭터 뒤를 따라가고, 길이 꺾이면 카메라도 같이 돌아요.
let streetMode = store.get("streetMode", false);
let streetFrame = null;
let camBearing = null;
const STREET = { pitch: 78, zoom: 18.4 };
const streetOn = () => streetMode && document.body.classList.contains("view-map") && !!path;

// 두 지점 사이 방향(북쪽 0°, 시계 방향)
function bearingBetween([lon1, lat1], [lon2, lat2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

// 지금 이 순간 걸은 거리 (타이머 틱보다 촘촘하게, 화면이 부드럽도록)
function liveMeters() {
  if (!session) return journey.walked_m;
  const remaining = ticker ? Math.max(0, session.endAt - Date.now()) : session.remainingMs;
  const elapsed = session.durationMs - remaining;
  return Math.min(session.targetM, session.startM + elapsed * session.speed);
}

// 걷는 중이거나 거리 시점이면 매 프레임 캐릭터(와 카메라)를 옮겨서 부드럽게 보여요.
const walkingNow = () => !!(session && ticker && path);
let userMovedAt = 0;
map.on("dragstart", () => (userMovedAt = Date.now()));
map.on("zoomstart", (e) => {
  if (e.originalEvent) userMovedAt = Date.now();
});
function ensureFrames() {
  if (!streetFrame && (streetOn() || walkingNow())) streetFrame = requestAnimationFrame(streetStep);
}

function streetStep() {
  streetFrame = null;
  if (!streetOn()) {
    if (!walkingNow()) return;
    const d = liveMeters();
    const here = pointAt(path, d).point;
    setWalker(here, pointAt(path, d + 30).point);
    setLine("wm-walked", sliceTo(path, d));
    // 위에서 볼 때도 카메라가 캐릭터를 살살 따라가요. 지도를 직접 움직였다면 4초 동안은 그대로 둬요.
    if ((flying() || document.body.classList.contains("view-map")) && Date.now() > Math.max(lastFollow, takeoffUntil) && Date.now() - userMovedAt > 4000) {
      const c = map.getCenter();
      map.jumpTo({ center: [c.lng + (here[0] - c.lng) * 0.06, c.lat + (here[1] - c.lat) * 0.06] });
    }
    streetFrame = requestAnimationFrame(streetStep);
    return;
  }
  const d = liveMeters();
  const here = pointAt(path, d).point;
  // 30m 앞을 보고 방향을 정하면 작은 꺾임에 카메라가 흔들리지 않아요.
  const ahead = pointAt(path, Math.min(path.total, d + 30)).point;
  const target = here[0] === ahead[0] && here[1] === ahead[1] ? camBearing ?? 0 : bearingBetween(here, ahead);
  if (camBearing === null) camBearing = target;
  const diff = ((target - camBearing + 540) % 360) - 180; // 가장 짧은 쪽으로 돌기
  camBearing = (camBearing + diff * 0.06 + 360) % 360;
  setWalker(here);
  if (session) setLine("wm-walked", sliceTo(path, d));
  map.jumpTo({ center: here, bearing: camBearing, pitch: STREET.pitch, zoom: STREET.zoom });
  streetFrame = requestAnimationFrame(streetStep);
}

function syncStreet() {
  const wasStreet = document.body.classList.contains("street");
  document.body.classList.toggle("street", streetOn());
  renderTabs();
  if (wasStreet !== streetOn()) {
    setStreetBuildings(streetOn());
    if (walkerShown) paintFigure(walkerEl.querySelector(".walker-body"));
  }
  if (streetOn() && !streetFrame) {
    camBearing = null;
    // 처음 들어갈 때는 부드럽게 내려앉고, 그다음부터 매 프레임 따라가요.
    const d = liveMeters();
    const here = pointAt(path, d).point;
    const ahead = pointAt(path, Math.min(path.total, d + 30)).point;
    camBearing = bearingBetween(here, ahead);
    updatePadding();
    map.easeTo({ center: here, bearing: camBearing, pitch: STREET.pitch, zoom: STREET.zoom, duration: 1400 });
    map.once("moveend", () => {
      if (streetOn() && !streetFrame) streetFrame = requestAnimationFrame(streetStep);
    });
  } else if (!streetOn()) {
    ensureFrames();
  }
}

// 거리 시점에서는 건물을 반투명하게 해서 캐릭터 뒤 건물이 시야를 가리지 않게 해요.
const buildingOpacity = {};
function setStreetBuildings(on) {
  const style = map.getStyle?.();
  if (!style) return;
  for (const layer of style.layers.filter((l) => l.type === "fill-extrusion")) {
    if (!(layer.id in buildingOpacity)) {
      buildingOpacity[layer.id] = map.getPaintProperty(layer.id, "fill-extrusion-opacity") ?? 1;
    }
    map.setPaintProperty(layer.id, "fill-extrusion-opacity", on ? 0.32 : buildingOpacity[layer.id]);
  }
}

function setStreetMode(on, refocus = true) {
  streetMode = on;
  store.set("streetMode", on, { sync: false });
  syncStreet();
  updatePadding();
  if (!on && refocus) focusWalker();
}

// ---------- 여정 표시 ----------
function renderJourney(liveMeters) {
  $("journey-flag").textContent = flying() ? "✈️" : "🏁";
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
  if (flying()) {
    const total = journey.flight_min;
    const done = walkedM / speedPerMin();
    $("journey-name").textContent = `${journey.name} (${journey.code})`;
    $("journey-flag").textContent = journey.flag;
    $("journey-bar").style.width = `${pct}%`;
    $("journey-mode").textContent = `✈️ ${FLIGHTS.origin.name} → ${journey.flag} ${journey.name}`;
    $("journey-text").textContent =
      left <= 0 ? "도착했어요! 다음 여행지를 골라 볼까요?" : `비행 ${formatMinutes(total)} 중 ${formatMinutes(Math.floor(done))} · ${pctText}`;
    if (!running()) {
      const leftMin = Math.ceil(left / speedPerMin());
      $("clock-sub").textContent = left > 0 ? `이번 집중으로 ${formatMinutes(Math.min(minutes, leftMin))} 비행` : "도착 완료";
    }
    return;
  }
  $("journey-name").textContent = journey.name;
  $("journey-bar").style.width = `${pct}%`;
  $("journey-text").textContent =
    left <= 0
      ? "도착했어요! 새 목적지를 정해 볼까요?"
      : `${formatDistance(journey.route.distance_m)} 중 ${formatDistance(walkedM)} · ${pctText}`;
  $("journey-mode").textContent =
    journey.route.mode === "road" ? `${wagwa(character.name)} 가는 길` : `${wagwa(character.name)} 가는 길 · 직선`;
  const sessionM = speedPerMin() * minutes;
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
  if (el.classList.contains("walker-body") && flying()) {
    el.classList.add("figure");
    el.innerHTML = '<span class="plane">✈️</span>';
    return;
  }
  const back = el.classList.contains("walker-body") && streetOn();
  el.innerHTML = `${Avatar.svg(outfit, { back })}<span class="fig-pet"></span>`;
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
  syncStreet();
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
    saveJourney();
    drawJourney();
    renderJourney();
    setView("map", false);
    setTimeout(() => {
      if (!streetMode) overview(); // 거리 시점이면 바로 캐릭터 뒤에서 출발해요
    }, 450);
    const where = origin.fallback ? "서울시청에서 출발해요 (위치 권한이 없어요). " : "";
    const sessions = Math.ceil(route.distance_m / (speedPerMin() * minutes));
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
  $("status").textContent = `🎲 ${randomKm}km 안의 명소를 고르는 중...`;
  const pos = await getPosition();
  try {
    const res = await api(`/api/attraction?lat=${pos.lat}&lon=${pos.lon}&km=${randomKm}`);
    const d = res.destination;
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
  $("btn-dice").disabled = mode !== "idle";
  $("clock-btn").disabled = mode !== "idle";
  walkerEl.classList.toggle("walking", mode === "running");
  renderModeSwitch();
  document.querySelector(".avatar").classList.toggle("walking", mode === "running");
}

function start() {
  if (!journey) return openDestPicker();
  // 지난번에 고른 소리가 있으면 집중을 시작할 때 다시 켜요 (브라우저는 버튼을 눌러야 소리를 내줘요)
  if (soundId && !Sound.playing()) {
    Sound.play(soundId);
    renderSound();
  }
  const left = journey.route.distance_m - journey.walked_m;
  if (left <= 0) return openDestPicker();
  const sessionM = speedPerMin() * minutes;
  // 목적지까지 조금만 남으면 그냥 도착으로 쳐요 (걷기 100m, 비행 5분)
  const snap = flying() ? speedPerMin() * 5 : 100;
  session = {
    startM: journey.walked_m,
    targetM:
      journey.route.distance_m - (journey.walked_m + sessionM) < snap
        ? journey.route.distance_m
        : journey.walked_m + sessionM,
    speed: sessionM / (minutes * MS_PER_MINUTE), // m/ms
    durationMs: minutes * MS_PER_MINUTE,
    remainingMs: minutes * MS_PER_MINUTE,
  };
  $("status").textContent = flying()
    ? `✈️ ${journey.name}행 비행기가 이륙했어요! 안전벨트를 매 주세요`
    : `${iga(character.name)} 출발했어요! ${character.line}`;
  setView("focus");
  resume();
  if (flying() && session.startM <= 0) takeOff();
}

function resume() {
  session.endAt = Date.now() + session.remainingMs;
  clearInterval(ticker);
  ticker = setInterval(tick, 200);
  setMode("running");
  tick();
  ensureFrames();
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
  if (!streetFrame) {
    setWalker(here, pointAt(path, d + 30).point);
    setLine("wm-walked", sliceTo(path, d));
  }
  if (!streetFrame && !streetOn() && Date.now() - lastFollow > 1500) {
    lastFollow = Date.now();
    map.easeTo({ center: here, duration: 1400, easing: (t) => t });
  }

  const clock = formatClock(session.remainingMs);
  $("clock").textContent = clock;
  $("clock-sub").textContent = flying()
    ? `${formatMinutes(Math.floor((d - session.startM) / speedPerMin()))} 비행`
    : `${formatDistance(d - session.startM)} 걸음`;
  renderJourney(d);
  $("ring-fill").style.strokeDashoffset = RING * (1 - progress);
  document.title = `${clock} · 걸음모도로`;

  if (session.remainingMs <= 0) finish();
}

function finish() {
  clearInterval(ticker);
  const walked = session.targetM - session.startM;
  journey.walked_m = session.targetM;
  saveJourney();
  session = null;
  setMode("idle");

  const dayKey = `day:${new Date().toLocaleDateString("sv-SE")}`;
  const today = store.get(dayKey, { minutes: 0, meters: 0, sessions: 0 });
  today.sessions = (today.sessions ?? 0) + 1;
  today.minutes += minutes;
  if (!flying()) today.meters += Math.round(walked);
  store.set(dayKey, today);

  const arrived = journey.walked_m >= journey.route.distance_m - 1;
  // 비행은 걷기와 같은 시간이면 같은 코인을 받아요 (1분 = 걸어서 75m 몫)
  const coinMeters = flying() ? (walked / speedPerMin()) * ((WALK_KMH * 1000) / 60) : walked;
  const earned = Math.floor(coinMeters / CATALOG.meters_per_coin) + (arrived ? CATALOG.arrival_bonus : 0);
  coins += earned;
  store.set("coins", coins);
  renderCharacter();
  $("done-coins").hidden = earned <= 0;
  $("done-coins").textContent = `🐾 발자국 코인 +${earned}`;
  const left = journey.route.distance_m - journey.walked_m;
  const end = path.coords[path.coords.length - 1];
  if (flying()) {
    $("done-emoji").textContent = arrived ? "🛬" : "✈️";
    $("done-title").textContent = arrived
      ? `${journey.flag} ${journey.name} 도착!`
      : `${formatMinutes(Math.round(walked / speedPerMin()))} 날았어요!`;
    $("done-text").textContent = arrived
      ? `${FLIGHTS.origin.name}에서 ${formatMinutes(journey.flight_min)}을 날아 ${journey.country}에 왔어요. 즐거운 여행!`
      : `${journey.name}까지 ${formatMinutes(Math.ceil(left / speedPerMin()))} 남았어요. 쉬고 나서 이어서 날아요.`;
  } else {
    $("done-emoji").textContent = arrived ? "🏁" : character.emoji;
    $("done-title").textContent = arrived ? `${journey.name} 도착!` : `${formatDistance(walked)} 걸었어요!`;
    $("done-text").textContent = arrived
      ? `${wagwa(character.name)} 함께 ${formatDistance(journey.route.distance_m)}를 걸어왔어요. 정말 수고했어요.`
      : `${journey.name}까지 ${formatDistance(left)} 남았어요. 쉬고 나서 이어 걸어요.`;
  }
  const link = $("done-link");
  link.hidden = flying() || !arrived || journey.route.distance_m > 15000;
  link.href = `https://map.kakao.com/link/to/${encodeURIComponent(journey.name)},${end[1]},${end[0]}`;

  document.title = arrived ? "🏁 도착! · 걸음모도로" : "☕ 쉬는 시간 · 걸음모도로";
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (flying() && arrived) {
    lastFollow = Date.now() + 6000;
    map.flyTo({ center: path.coords.at(-1), zoom: 10.5, pitch: 40, bearing: 0, duration: 5000 });
  }
  confetti(
    flying()
      ? arrived ? ["🎉", "🛬", "✨", journey.flag] : ["☁️", "✈️", "✨"]
      : arrived ? ["🎉", "🏁", "✨", character.emoji] : ["✨", "🌿", character.emoji],
  );
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

  const labels = $("label-options");
  labels.innerHTML = "";
  for (const [id, name] of [["simple", "간단히"], ["all", "모두 보기"]]) {
    const btn = document.createElement("button");
    btn.className = `chip${labelMode === id ? " active" : ""}`;
    btn.textContent = name;
    btn.addEventListener("click", () => {
      labelMode = id;
      store.set("labels", id, { sync: false });
      applyLabels();
      renderSettings();
    });
    labels.appendChild(btn);
  }
  renderCloset();
  renderToday();
}

// ---------- 버튼 연결 ----------
$("btn-start").addEventListener("click", start);
$("btn-pause").addEventListener("click", () => ($("btn-pause").textContent === "일시정지" ? pause() : resume()));
$("btn-stop").addEventListener("click", stop);
$("dest-chip").addEventListener("click", openDestPicker);
$("btn-settings").addEventListener("click", () => {
  renderSettings();
  openModal("settings-modal");
});
function openCloset() {
  renderSettings();
  openModal("closet-modal");
}
$("btn-coins").addEventListener("click", openCloset);
$("btn-overview").addEventListener("click", () => {
  if (streetMode) setStreetMode(false, false);
  overview();
});

// ---------- 아래 탭 ----------
function currentTab() {
  if (document.body.classList.contains("view-focus")) return "focus";
  return streetMode ? "street" : "map";
}
function renderTabs() {
  const active = currentTab();
  for (const t of document.querySelectorAll(".tab")) {
    const on = t.dataset.tab === active;
    t.classList.toggle("active", on);
    t.setAttribute("aria-current", on ? "page" : "false");
  }
}
function setTab(tab) {
  if (tab === "closet") return openCloset();
  if (tab === "focus") return setView("focus");
  if ((tab === "street" || tab === "map") && !journey) {
    $("status").textContent = "먼저 목적지를 정해 주세요";
    return openDestPicker();
  }
  if (tab === "street" && flying()) {
    tab = "map";
  }
  const wantStreet = tab === "street";
  const fromMap = document.body.classList.contains("view-map");
  if (streetMode !== wantStreet) setStreetMode(wantStreet, fromMap);
  if (!fromMap) setView("map");
  renderTabs();
}
for (const t of document.querySelectorAll(".tab")) t.addEventListener("click", () => setTab(t.dataset.tab));
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
  $("time-hint").textContent = flying()
    ? `${formatMinutes(draftMinutes)} 동안 ${formatMinutes(draftMinutes)}만큼 날아가요`
    : `${formatMinutes(draftMinutes)} 동안 약 ${formatDistance(meters)} 걸어요`;
  for (const c of document.querySelectorAll("#time-presets .chip")) {
    c.classList.toggle("active", Number(c.dataset.min) === draftMinutes);
  }
}

for (const chip of document.querySelectorAll("#minute-chips .chip[data-min]")) {
  chip.addEventListener("click", () => setMinutes(chip.dataset.min));
}
function openTimePicker() {
  if (session) return; // 집중하는 동안에는 시간을 바꾸지 않아요
  draftMinutes = minutes;
  renderTimePicker();
  openModal("time-modal");
}
$("chip-custom").addEventListener("click", openTimePicker);
$("clock-btn").addEventListener("click", openTimePicker);
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
    journey: store.get("journey", null),
    flight: store.get("flight", null),
    travelMode,
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
  if ("flight" in state) store.set("flight", state.flight ?? null, quiet);
  if (state.travelMode) store.set("travelMode", state.travelMode, quiet);
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

// ---------- 낮·밤과 날씨 (한국 시간 기준) ----------
const PHASES = {
  dawn: { name: "새벽", sky: "#f7c9d4", horizon: "#ffe3c4", fog: "#fbe6dc" },
  day: { name: "낮", sky: "#bfe3ff", horizon: "#fff1e2", fog: "#fff6ec" },
  dusk: { name: "노을", sky: "#f29f8f", horizon: "#ffd29a", fog: "#f7d9c4" },
  night: { name: "밤", sky: "#1d2550", horizon: "#46507e", fog: "#2a3158" },
};
let phase = "day";
let weatherNow = null;

// 해 뜨는 시각·지는 시각 (NOAA 간단 공식, 오차 몇 분). 계절과 위치에 따라 달라져요.
function sunTimes(date, lat, lon) {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const n = Math.round(jd - 2451545 + 0.0008);
  const jStar = n - lon / 360;
  const m = (357.5291 + 0.98560028 * jStar) % 360;
  const c = 1.9148 * Math.sin(m * rad) + 0.02 * Math.sin(2 * m * rad) + 0.0003 * Math.sin(3 * m * rad);
  const lambda = (m + c + 180 + 102.9372) % 360;
  const transit = 2451545 + jStar + 0.0053 * Math.sin(m * rad) - 0.0069 * Math.sin(2 * lambda * rad);
  const decl = Math.asin(Math.sin(lambda * rad) * Math.sin(23.44 * rad));
  const cosW = (Math.sin(-0.833 * rad) - Math.sin(lat * rad) * Math.sin(decl)) / (Math.cos(lat * rad) * Math.cos(decl));
  if (cosW > 1) return null; // 극야
  if (cosW < -1) return null; // 백야
  const w = Math.acos(cosW) / rad;
  const toDate = (j) => new Date((j - 2440587.5) * 86400000);
  return { rise: toDate(transit - w / 360), set: toDate(transit + w / 360) };
}

let sunPos = store.get("lastPos", FALLBACK); // 마지막으로 알던 위치 (없으면 서울)
function phaseNow(now = new Date()) {
  const sun = sunTimes(now, sunPos.lat, sunPos.lon);
  if (!sun) return "day";
  const min = 60000;
  const t = now.getTime();
  const rise = sun.rise.getTime();
  const set = sun.set.getTime();
  if (t >= rise - 40 * min && t < rise + 30 * min) return "dawn";
  if (t >= rise + 30 * min && t < set - 40 * min) return "day";
  if (t >= set - 40 * min && t < set + 30 * min) return "dusk";
  return "night";
}

function applyAtmosphere() {
  const params = new URLSearchParams(location.search);
  phase = params.get("phase") || phaseNow(); // ?phase=night 로 미리 보기
  for (const k of Object.keys(PHASES)) document.body.classList.toggle(`phase-${k}`, k === phase);
  const kind = params.get("weather") || weatherNow?.kind || "clear";
  for (const k of ["clear", "cloudy", "fog", "rain", "snow", "storm"]) {
    document.body.classList.toggle(`wx-${k}`, k === kind);
  }
  applySky();
  startWeatherFx(kind);
  $("theme-color")?.setAttribute("content", phase === "night" ? "#1d2550" : "#fff6ec");
}

async function loadWeather() {
  const pos = await getPosition();
  if (!pos.fallback) {
    sunPos = { lat: pos.lat, lon: pos.lon };
    store.set("lastPos", sunPos, { sync: false });
  }
  try {
    weatherNow = await api(`/api/weather?lat=${pos.lat}&lon=${pos.lon}`);
    const chip = $("weather-chip");
    chip.textContent = `${weatherNow.emoji} ${weatherNow.temp}°`;
    chip.setAttribute("aria-label", `지금 날씨 ${weatherNow.label} ${weatherNow.temp}도`);
    chip.hidden = false;
  } catch {
    weatherNow = null; // 날씨를 못 받아도 낮·밤은 그대로 보여요
  }
  applyAtmosphere();
}

$("weather-chip").addEventListener("click", () => {
  if (!weatherNow) return;
  const tips = {
    clear: "산책하기 좋은 날이에요",
    cloudy: "선선하게 걷기 좋아요",
    fog: "안개가 꼈어요. 천천히 걸어요",
    rain: "비가 와요. 오늘은 지도 속에서 걸어요",
    snow: "눈이 와요! 미끄러우니 조심해요",
    storm: "천둥번개가 쳐요. 실내에서 집중해요",
  };
  $("status").textContent = `지금 ${weatherNow.label} ${weatherNow.temp}° · ${PHASES[phase].name} · ${tips[weatherNow.kind]}`;
});

// 비·눈 내리는 효과 (가볍게, 움직임 줄이기 설정이면 꺼요)
let fxFrame = null;
function startWeatherFx(kind) {
  const canvas = $("weather-fx");
  cancelAnimationFrame(fxFrame);
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const falling = { rain: "rain", storm: "rain", snow: "snow" }[kind];
  if (!falling || reduce) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }
  const dpr = Math.min(2, devicePixelRatio || 1);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const n = falling === "rain" ? 70 : 55;
  const drops = Array.from({ length: n }, () => ({
    x: Math.random() * innerWidth,
    y: Math.random() * innerHeight,
    v: falling === "rain" ? 7 + Math.random() * 5 : 0.6 + Math.random() * 0.9,
    r: falling === "rain" ? 10 + Math.random() * 8 : 1.5 + Math.random() * 2.5,
    w: Math.random() * Math.PI * 2,
  }));
  (function frame() {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    ctx.strokeStyle = phase === "night" ? "rgb(200 215 255 / 55%)" : "rgb(120 150 190 / 45%)";
    ctx.fillStyle = "rgb(255 255 255 / 90%)";
    ctx.lineWidth = 1.3;
    for (const d of drops) {
      if (falling === "rain") {
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + d.r);
        ctx.stroke();
        d.y += d.v;
        d.x -= 0.6;
      } else {
        d.w += 0.02;
        ctx.beginPath();
        ctx.arc(d.x + Math.sin(d.w) * 8, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
        d.y += d.v;
      }
      if (d.y > innerHeight) {
        d.y = -20;
        d.x = Math.random() * innerWidth;
      }
    }
    fxFrame = requestAnimationFrame(frame);
  })();
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

document.body.classList.toggle("fly", flying());
$("dest-flag").textContent = flying() ? "✈️" : "🏁";
for (const b of document.querySelectorAll("#mode-switch .mode-card")) {
  b.addEventListener("click", () => onModeTap(b.dataset.mode));
}
$("btn-dice").addEventListener("click", rollDice);
renderSound();
renderModeSwitch();
renderCharacter();
renderMinuteChips();
renderTabs();
applyAtmosphere();
loadWeather();
setInterval(applyAtmosphere, 60 * 1000); // 1분마다 낮·밤 다시 확인
setInterval(loadWeather, 20 * 60 * 1000);
// 홈 화면 앱은 며칠씩 켜져 있을 수 있어서, 다시 열 때마다 시간·날씨를 새로 봐요.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    applyAtmosphere();
    loadWeather();
  }
});
updatePadding();
resetClock();
renderToday();
setMode("idle");
if (journey) {
  map.once("load", () => focusWalker(false));
  $("status").textContent = `${journey.name}까지 이어서 ${flying() ? "날아요" : "걸어요"}`;
} else {
  $("status").textContent = "목적지를 정하고 집중을 시작해요";
  getPosition().then((p) => map.jumpTo({ center: [p.lon, p.lat] }));
}
