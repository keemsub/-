// 걸음모도로 화면 코드
// 흐름: 시작 → 내 위치 + 오늘의 여행지 받아오기 → 타이머가 도는 동안 거북이가 걸어감 → 도착!

const FALLBACK = { lat: 37.5665, lon: 126.978 }; // 위치 권한이 없을 때: 서울시청
// 주소 끝에 ?fast=1 을 붙이면 1분이 1초로 줄어요 (테스트용)
const SECOND_PER_MINUTE = new URLSearchParams(location.search).has("fast") ? 1000 : 60000;

const $ = (id) => document.getElementById(id);

// ---------- 지도 ----------
const map = L.map("map").setView([FALLBACK.lat, FALLBACK.lon], 14);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

const emoji = (char, extra = "") =>
  L.divIcon({ html: char, className: `emoji-marker ${extra}`, iconSize: [32, 32], iconAnchor: [16, 24] });

let tripLayer = null;
let turtle = null;
let trail = null;
let flag = null;

// ---------- 상태 ----------
let trip = null; // 서버가 준 여행 정보
let origin = null;
let durationMs = 0;
let remainingMs = 0;
let endAt = 0;
let ticker = null;

// ---------- 오늘의 기록 (브라우저에 저장) ----------
const todayKey = () => `walkmodoro:${new Date().toLocaleDateString("sv-SE")}`;

function loadToday() {
  try {
    return JSON.parse(localStorage.getItem(todayKey())) || { minutes: 0, meters: 0, trips: [] };
  } catch {
    return { minutes: 0, meters: 0, trips: [] };
  }
}

function saveToday(record) {
  try {
    localStorage.setItem(todayKey(), JSON.stringify(record));
  } catch {
    // 저장이 막힌 브라우저(시크릿 모드 등)에서는 조용히 넘어가요.
  }
}

function renderToday() {
  const record = loadToday();
  if (!record.trips.length) {
    $("today-summary").textContent = "아직 기록이 없어요.";
    $("today-trips").innerHTML = "";
    return;
  }
  $("today-summary").textContent =
    `집중 ${record.minutes}분 · 거북이가 ${formatDistance(record.meters)} 걸었어요 · 여행지 ${record.trips.length}곳`;
  $("today-trips").innerHTML = "";
  for (const t of record.trips) {
    const li = document.createElement("li");
    li.textContent = `${t.name} (${t.kind}) · ${t.minutes}분`;
    $("today-trips").appendChild(li);
  }
}

// ---------- 도우미 ----------
const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(1)}km` : `${m}m`);

function formatClock(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

function getPosition() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...FALLBACK, fallback: true });
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve({ ...FALLBACK, fallback: true }),
      { timeout: 8000 },
    );
  });
}

function setButtons(mode) {
  // mode: idle | running | paused
  $("start").hidden = mode !== "idle";
  $("minutes").disabled = mode !== "idle";
  $("pause").hidden = mode === "idle";
  $("stop").hidden = mode === "idle";
  $("pause").textContent = mode === "paused" ? "계속하기" : "일시정지";
}

// ---------- 타이머 ----------
async function start() {
  const minutes = Number($("minutes").value);
  $("arrival").hidden = true;
  $("start").disabled = true;
  $("status").textContent = "위치를 확인하는 중...";

  const pos = await getPosition();
  $("status").textContent = "오늘의 여행지를 고르는 중...";

  let res;
  try {
    res = await fetch(`/api/trip?lat=${pos.lat}&lon=${pos.lon}&minutes=${minutes}`);
  } catch {
    res = null;
  }
  $("start").disabled = false;
  if (!res || !res.ok) {
    $("status").textContent = "여행지를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
    return;
  }

  trip = await res.json();
  origin = pos;
  drawTrip(pos.fallback);

  durationMs = minutes * SECOND_PER_MINUTE;
  remainingMs = durationMs;
  resume();
}

function drawTrip(isFallback) {
  if (tripLayer) tripLayer.remove();
  const dest = trip.destination;
  const area = L.geoJSON(trip.geojson, { style: { color: "#5fb38a", weight: 2, fillOpacity: 0.15 } });

  turtle = L.marker([origin.lat, origin.lon], { icon: emoji("🐢", "walking"), zIndexOffset: 1000 });
  flag = L.marker([dest.lat, dest.lon], { icon: emoji("❓") });
  trail = L.polyline([[origin.lat, origin.lon]], { color: "#5fb38a", dashArray: "4 6" });
  tripLayer = L.layerGroup([area, trail, flag, turtle]).addTo(map);
  map.fitBounds(area.getBounds(), { padding: [20, 20] });

  const where = isFallback ? "서울시청에서 (위치 권한이 없어요) " : "";
  const demo = trip.provider === "demo" ? " · 데모 지도" : "";
  $("status").textContent = `${where}거북이가 출발했어요! 도착지는 비밀 ❓${demo}`;
}

function resume() {
  endAt = Date.now() + remainingMs;
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  setButtons("running");
  tick();
}

function pause() {
  remainingMs = Math.max(0, endAt - Date.now());
  clearInterval(ticker);
  setButtons("paused");
  $("status").textContent = "거북이가 잠깐 쉬는 중이에요.";
}

function stop() {
  clearInterval(ticker);
  setButtons("idle");
  $("clock").textContent = formatClock(Number($("minutes").value) * SECOND_PER_MINUTE);
  document.title = "걸음모도로";
  $("status").textContent = "여행을 멈췄어요. 다음엔 끝까지 가 봐요!";
}

function tick() {
  remainingMs = Math.max(0, endAt - Date.now());
  const progress = 1 - remainingMs / durationMs;
  const dest = trip.destination;
  const lat = origin.lat + (dest.lat - origin.lat) * progress;
  const lon = origin.lon + (dest.lon - origin.lon) * progress;
  turtle.setLatLng([lat, lon]);
  trail.setLatLngs([[origin.lat, origin.lon], [lat, lon]]);

  const clock = formatClock(remainingMs);
  $("clock").textContent = clock;
  document.title = `${clock} · 걸음모도로`;

  if (remainingMs <= 0) arrive();
}

function arrive() {
  clearInterval(ticker);
  setButtons("idle");
  document.title = "🏁 도착! · 걸음모도로";
  const dest = trip.destination;
  flag.setIcon(emoji("🏁"));
  // 장소 이름은 외부 데이터라서 HTML로 넣지 않고 글자로만 넣어요.
  const popup = document.createElement("div");
  popup.innerHTML = "<b></b><br><span></span>";
  popup.querySelector("b").textContent = dest.name;
  popup.querySelector("span").textContent = dest.kind;
  flag.bindPopup(popup).openPopup();

  $("dest-name").textContent = dest.name;
  $("dest-kind").textContent = dest.kind;
  $("dest-distance").textContent = formatDistance(dest.distance_m);
  $("dest-link").href =
    `https://map.kakao.com/link/to/${encodeURIComponent(dest.name)},${dest.lat},${dest.lon}`;
  $("arrival").hidden = false;
  $("status").textContent = "수고했어요! 이제 쉬는 시간이에요.";
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);

  const record = loadToday();
  record.minutes += trip.minutes;
  record.meters += dest.distance_m;
  record.trips.push({ name: dest.name, kind: dest.kind, minutes: trip.minutes });
  saveToday(record);
  renderToday();
}

// ---------- 버튼 연결 ----------
$("start").addEventListener("click", start);
$("pause").addEventListener("click", () => ($("pause").textContent === "일시정지" ? pause() : resume()));
$("stop").addEventListener("click", stop);
$("minutes").addEventListener("change", () => {
  $("clock").textContent = formatClock(Number($("minutes").value) * SECOND_PER_MINUTE);
});

$("clock").textContent = formatClock(Number($("minutes").value) * SECOND_PER_MINUTE);
renderToday();
