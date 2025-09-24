// gps.js

const DEBUG = true; // デバッグモードを有効にする場合はtrueに設定
const HEADING_FILTER_ALPHA = 0.3;
const HEADING_UPDATE_THRESHOLD = 1;
// ★★★ 修正方針 2: スパイク除去の閾値 (調整可能) ★★★
const HEADING_SPIKE_THRESHOLD = 45;

const DECLINATION_UPDATE_DISTANCE_M = 1000; // m
const DECLINATION_UPDATE_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3時間

// 系番号ごとの中央経線と代表磁偏角（度）
const JGD2011_ZONE_INFO = {
    1: { lon0: 129.5, declination: 7.0 },
    2: { lon0: 131.0, declination: 7.5 },
    3: { lon0: 132.1666667, declination: 7.5 },
    4: { lon0: 133.5, declination: 7.0 },
    5: { lon0: 134.3333333, declination: 6.8 },
    6: { lon0: 136.0, declination: 6.5 },
    7: { lon0: 137.1666667, declination: 6.0 },
    8: { lon0: 138.5, declination: 5.5 },
    9: { lon0: 139.8333333, declination: 5.0 },
    10: { lon0: 140.8333333, declination: 4.5 },
    11: { lon0: 140.25, declination: 7.0 },
    12: { lon0: 142.25, declination: 6.5 },
    13: { lon0: 144.25, declination: 6.0 },
    14: { lon0: 142.0, declination: 3.0 },
    15: { lon0: 127.5, declination: 6.0 },
    16: { lon0: 124.0, declination: 5.5 },
    17: { lon0: 131.0, declination: 5.0 },
    18: { lon0: 136.0833333, declination: 4.0 },
    19: { lon0: 154.0, declination: 2.0 }
};

let currentDeclination = 0;
let lastDeclinationUpdatePos = null;
let lastDeclinationUpdateAt = 0;
let lastCompassHeading = null;
let lastCurrentHeading = null;
// ★★★ 修正方針 3: 初期化フラグ ★★★
let compassInitialized = false;

// --- ユーティリティ ---
function toTrueNorth(magneticHeading, declination) {
    if (magneticHeading === null || isNaN(magneticHeading)) return null;
    return (magneticHeading + declination + 360) % 360;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function detectJGD2011Zone(lat, lon) {
    let minDiff = Infinity;
    let zone = null;
    for (const [zoneNum, info] of Object.entries(JGD2011_ZONE_INFO)) {
        const diff = Math.abs(lon - info.lon0);
        if (diff < minDiff) {
            minDiff = diff;
            zone = parseInt(zoneNum, 10);
        }
    }
    return zone;
}

function shouldUpdateDeclination(lat, lon) {
    const now = Date.now();
    if (!lastDeclinationUpdatePos) return true;
    if (now - lastDeclinationUpdateAt > DECLINATION_UPDATE_INTERVAL_MS) return true;
    return getDistanceMeters(lastDeclinationUpdatePos.lat, lastDeclinationUpdatePos.lon, lat, lon) > DECLINATION_UPDATE_DISTANCE_M;
}

async function fetchDeclination(lat, lon) {
    const url = `https://vldb.gsi.go.jp/sokuchi/geomag/api/declination?lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data.declination !== 'number') throw new Error("Invalid API response");
    return data.declination;
}

async function updateDeclinationIfNeeded(lat, lon) {
    if (!shouldUpdateDeclination(lat, lon)) return currentDeclination;
    try {
        const decl = await fetchDeclination(lat, lon);
        currentDeclination = decl;
        if (DEBUG) console.log(`磁偏角API成功: ${decl.toFixed(2)}°`);
    } catch (err) {
        const zone = detectJGD2011Zone(lat, lon);
        currentDeclination = JGD2011_ZONE_INFO[zone]?.declination ?? 0;
        console.error(`磁偏角API失敗。系${zone}の代表値を使用: ${currentDeclination.toFixed(2)}°`);
    }
    lastDeclinationUpdatePos = { lat, lon };
    lastDeclinationUpdateAt = Date.now();
    return currentDeclination;
}

// --- GPS ---
function startGeolocation() {
    if (!navigator.geolocation) {
        dom.gpsStatus.textContent = "ブラウザが非対応です";
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
        return;
    }
    watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

function handlePositionSuccess(position) {
    const { latitude, longitude } = position.coords;
    updateDeclinationIfNeeded(latitude, longitude);
    onPositionUpdate(position); // mapController.jsの関数を呼び出す
    updateDebugPanel(lastRawHeading, lastDrawnMarkerAngle);
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    console.error(`GPS Error: ${msg}`, error);
}

// --- コンパス ---
function startCompass() {
    const addListeners = () => {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener('deviceorientation', onCompassUpdate, true);
                    } else {
                        console.warn('Compass permission denied');
                    }
                })
                .catch(err => {
                    console.error('Compass permission request error:', err);
                });
        } else {
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', onCompassUpdate, true);
            } else {
                window.addEventListener('deviceorientation', onCompassUpdate, true);
            }
        }
    };
    document.body.addEventListener('click', addListeners, { once: true });
}

function onCompassUpdate(event) {
    let newRawHeading = null;
    if (event.webkitCompassHeading !== undefined) {
        newRawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        newRawHeading = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (newRawHeading === null || isNaN(newRawHeading)) return;

    if (lastRawHeading !== null) {
        let delta = newRawHeading - lastRawHeading;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;

        // ★★★ 修正方針 2 & 4: スパイク除去 & ログ強化 ★★★
        if (Math.abs(delta) > HEADING_SPIKE_THRESHOLD) {
            console.log(`[DEBUG-RM2] Spike抑制 diff=${delta.toFixed(1)}`);
            return;
        }
    }
    lastRawHeading = newRawHeading;

    const trueHeading = toTrueNorth(lastRawHeading, currentDeclination);
    if (trueHeading === null) return;
    
    // 平滑化フィルタ (Low-pass filter)
    if (lastCurrentHeading === null) {
        lastCurrentHeading = trueHeading;
    }
    let delta = trueHeading - lastCurrentHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    
    currentHeading = (lastCurrentHeading + (delta * HEADING_FILTER_ALPHA) + 360) % 360;
    lastCurrentHeading = currentHeading;

    // ★★★ 修正方針 3: 初期化改善 ★★★
    if (!compassInitialized) {
        compassInitialized = true;
        // ★★★ 修正方針 4: デバッグログ強化 ★★★
        console.log("[DEBUG-INIT] 初期化イベント: updateMapRotation強制呼び出し");
        // この時点で`currentHeading`には有効な値が入っているため、直接呼び出す
        if (typeof updateMapRotation === 'function') {
            updateMapRotation();
        }
    }
    
    updateDebugPanel(lastRawHeading, lastDrawnMarkerAngle);
}


// --- デバッグUI関連 ---
let debugPanel = null;

function initDebugPanel() {
    if (!DEBUG) return;
    debugPanel = document.createElement('div');
    debugPanel.style.position = 'fixed';
    debugPanel.style.bottom = '10px';
    debugPanel.style.right = '10px';
    debugPanel.style.background = 'rgba(0,0,0,0.6)';
    debugPanel.style.color = '#fff';
    debugPanel.style.fontSize = '12px';
    debugPanel.style.fontFamily = 'monospace';
    debugPanel.style.padding = '6px 8px';
    debugPanel.style.borderRadius = '4px';
    debugPanel.style.zIndex = '9999';
    debugPanel.style.pointerEvents = 'none';
    document.body.appendChild(debugPanel);
    updateDebugPanel();
}

function updateDebugPanel(rawHeadingVal = null, drawnAngle = null) {
    if (!DEBUG || !debugPanel) return;
    const zone = lastDeclinationUpdatePos
        ? detectJGD2011Zone(lastDeclinationUpdatePos.lat, lastDeclinationUpdatePos.lon)
        : '-';
    const decl = currentDeclination ? currentDeclination.toFixed(2) : '-';
    const headingTN = (typeof currentHeading === 'number')
        ? currentHeading.toFixed(1)
        : '-';
    const raw = (rawHeadingVal !== null && !isNaN(rawHeadingVal))
        ? rawHeadingVal.toFixed(1)
        : '-';
    const last = (lastCompassHeading !== null && !isNaN(lastCompassHeading))
        ? lastCompassHeading.toFixed(1)
        : '-';
    const drawn = (drawnAngle !== null && !isNaN(drawnAngle))
        ? drawnAngle.toFixed(1)
        : '-';
    const mapRot = (mapRotationAngle !== null && !isNaN(mapRotationAngle))
        ? mapRotationAngle.toFixed(1)
        : '-';

    debugPanel.innerHTML =
        `Zone: ${zone}<br>` +
        `Decl: ${decl}°<br>` +
        `Raw(filtered): ${raw}°<br>` + 
        `Last(TN): ${last}°<br>` +
        `Heading(TN): ${headingTN}°<br>` +
        `DrawnAngle: ${drawn}°<br>` +
        `MapRotation: ${mapRot}°`;
}


window.addEventListener('load', () => {
    initDebugPanel();
});

