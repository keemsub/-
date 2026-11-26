// 지도를 그리고, 서버에 "이 위치에서 N분이면 어디까지?"를 물어보는 코드입니다.

const FALLBACK = { lat: 37.5665, lon: 126.978 }; // 위치 권한이 없을 때: 서울시청

const map = L.map("map").setView([FALLBACK.lat, FALLBACK.lon], 14);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);

let layer = null;
const statusEl = document.getElementById("status");

async function showIsochrone(lat, lon) {
  const minutes = document.getElementById("minutes").value;
  statusEl.textContent = "걸어갈 수 있는 범위를 계산하는 중...";

  const res = await fetch(`/api/isochrone?lat=${lat}&lon=${lon}&minutes=${minutes}`);
  if (!res.ok) {
    statusEl.textContent = "범위를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.";
    return;
  }
  const data = await res.json();

  if (layer) layer.remove();
  layer = L.layerGroup([
    L.geoJSON(data.geojson, { style: { color: "#5fb38a", fillOpacity: 0.25 } }),
    L.marker([lat, lon]).bindPopup("🐢 지금 여기"),
  ]).addTo(map);
  map.fitBounds(L.geoJSON(data.geojson).getBounds(), { padding: [20, 20] });

  const mode = data.provider === "demo" ? " (데모: 직선 거리 기준)" : "";
  statusEl.textContent = `${minutes}분 동안 걸어서 갈 수 있는 범위예요${mode}.`;
}

document.getElementById("show").addEventListener("click", () => {
  if (!navigator.geolocation) {
    showIsochrone(FALLBACK.lat, FALLBACK.lon);
    return;
  }
  statusEl.textContent = "위치를 확인하는 중...";
  navigator.geolocation.getCurrentPosition(
    (pos) => showIsochrone(pos.coords.latitude, pos.coords.longitude),
    () => {
      statusEl.textContent = "위치 권한이 없어서 서울시청 기준으로 보여드려요.";
      showIsochrone(FALLBACK.lat, FALLBACK.lon);
    },
  );
});
