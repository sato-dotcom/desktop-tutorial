// gps.js

const DEBUG = true; // デバッグモードを有効にする場合はtrueに設定
// ★★★ 調整可能なパラメータ ★★★
const HEADING_FILTER_ALPHA = 0.3; // 平滑化フィルタ係数 (0.2-0.4推奨)
const HEADING_SPIKE_THRESHOLD = 45; // スパイクとみなすrawHeadingの急変角度 (30-60°推奨)

const DECLINATION_UPDATE_DISTANCE_M = 1000; // m
const DECLINATION_UPDATE_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3時間

const JGD2011_ZONE_INFO = {
    1: { lon0: 129.5, declination: 7.0 }, 2: { lon0: 131.0, declination: 7.5 },
    3: { lon0: 132.1666667, declination: 7.5 }, 4: { lon0: 133.5, declination: 7.0 },
    5: { lon0: 134.3333333, declination: 6.8 }, 6: { lon0: 136.0, declination: 6.5 },
    7: { lon0: 137.1666667, declination: 6.0 }, 8: { lon0: 138.5, declination: 5.5 },
    9: { lon0: 139.8333333, declination: 5.0 }, 10: { lon0: 140.8333333, declination: 4.5 },
    11: { lon0: 140.25, declination: 7.0 }, 12: { lon0: 142.25, declination: 6.5 },
    13: { lon0: 144.25, declination: 6.0 }, 14: { lon0: 142.0, declination: 3.0 },
    15: { lon0: 127.5, declination: 6.0 }, 16: { lon0: 124.0, declination: 5.5 },
    17: { lon0: 131.0, declination: 5.0 }, 18: { lon0: 136.0833333, declination: 4.0 },
    19: { lon0: 154.0, declination: 2.0 }
};

let currentDeclination = 0;
let lastDeclinationUpdatePos = null;
let lastDeclinationUpdateAt = 0;
let lastCurrentHeading = null;
let compassInitialized = false;
let permissionLogged = false;

// --- ユーティリティ ---
function toTrueNorth(magneticHeading, declination) {
    if (magneticHeading === null || isNaN(magneticHeading)) return null;
    return (magneticHeading + declination + 360) % 360;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function detectJGD2011Zone(lat, lon) {
    let minDiff = Infinity, zone = null;
    for (const [zoneNum, info] of Object.entries(JGD2011_ZONE_INFO)) {
        const diff = Math.abs(lon - info.lon0);
        if (diff < minDiff) { minDiff = diff; zone = parseInt(zoneNum, 10); }
    }
    return zone;
}

function shouldUpdateDeclination(lat, lon) {
    const now = Date.now();
    if (!lastDeclinationUpdatePos) return true;
    if (now - lastDeclinationUpdateAt > DECLINATION_UPDATE_INTERVAL_MS) return true;
    return getDistanceMeters(lastDeclinationUpdatePos.lat, lastDeclinationUpdatePos.lon, lat, lon) > DECLINATION_UPDATE_DISTANCE_M;
}

async function updateDeclinationIfNeeded(lat, lon) {
    if (!shouldUpdateDeclination(lat, lon)) return;
    try {
        const res = await fetch(`https://vldb.gsi.go.jp/sokuchi/geomag/api/declination?lat=${lat}&lon=${lon}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (typeof data.declination !== 'number') throw new Error("Invalid API response");
        currentDeclination = data.declination;
    } catch (err) {
        const zone = detectJGD2011Zone(lat, lon);
        currentDeclination = JGD2011_ZONE_INFO[zone]?.declination ?? 0;
        console.error(`磁偏角API失敗。系${zone}の代表値を使用: ${currentDeclination.toFixed(2)}°`, err);
    }
    lastDeclinationUpdatePos = { lat, lon };
    lastDeclinationUpdateAt = Date.now();
}

// --- GPS ---
function startGeolocation() {
    if (!navigator.geolocation) {
        if (!permissionLogged) console.warn('[PERM] Geolocation not supported');
        permissionLogged = true;
        dom.gpsStatus.textContent = "ブラウザが非対応です";
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
        return;
    }
    watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, {
        enableHighAccuracy: true, timeout: 10000, maximumAge: 0
    });
}

function handlePositionSuccess(position) {
    updateDeclinationIfNeeded(position.coords.latitude, position.coords.longitude);
    onPositionUpdate(position);
    updateDebugPanel();
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) {
        msg = "アクセス拒否";
        if (!permissionLogged) console.warn('[PERM] Geolocation permission denied');
        permissionLogged = true;
    }
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    console.error(`GPS Error: ${msg}`, error);
}

// --- コンパス ---
function startCompass() {
    const addListeners = () => {
        const eventName = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener(eventName, onCompassUpdate, true);
                    } else {
                        if (!permissionLogged) console.warn('[PERM] Compass permission denied');
                        permissionLogged = true;
                    }
                }).catch(err => {
                    if (!permissionLogged) console.error('[PERM] Compass permission request error:', err);
                    permissionLogged = true;
                });
        } else {
            window.addEventListener(eventName, onCompassUpdate, true);
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

    if (newRawHeading === null || isNaN(newRawHeading)) {
        // B. ガード条件の緩和: 不正な値は警告を出してスキップ
        console.warn(`[WARN-HEADING] Invalid raw heading received:`, event);
        return;
    }

    // B. ガード条件の緩和: 初回フレームはスパイク判定をしない
    if (lastRawHeading !== null) {
        let delta = newRawHeading - lastRawHeading;
        if (delta > 180) delta -= 360;
        if (delta < -180) delta += 360;
        if (Math.abs(delta) > HEADING_SPIKE_THRESHOLD) {
            return; // rawHeadingのスパイクはここで除去
        }
    }
    lastRawHeading = newRawHeading;

    const trueHeading = toTrueNorth(lastRawHeading, currentDeclination);
    if (trueHeading === null) return;
    
    if (lastCurrentHeading === null) lastCurrentHeading = trueHeading;
    let delta = trueHeading - lastCurrentHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    currentHeading = (lastCurrentHeading + delta * HEADING_FILTER_ALPHA + 360) % 360;
    lastCurrentHeading = currentHeading;

    // A. イベント配線の確認: 初期化処理
    if (!compassInitialized && typeof currentHeading === 'number' && !isNaN(currentHeading)) {
        compassInitialized = true;
        console.log(`[DEBUG-INIT] first raw=${lastRawHeading.toFixed(1)}, current=${currentHeading.toFixed(1)} → apply`);
    }
    
    // A. イベント配線の確認: センサー更新の都度、必ず描画関数を呼び出す
    if (typeof updateMapRotation === 'function') {
        updateMapRotation();
    }
    
    updateDebugPanel();
}


// --- デバッグUI関連 ---
let debugPanel = null;
function initDebugPanel() {
    if (!DEBUG) return;
    debugPanel = document.createElement('div');
    Object.assign(debugPanel.style, {
        position: 'fixed', bottom: '10px', right: '10px',
        background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: '12px',
        fontFamily: 'monospace', padding: '6px 8px', borderRadius: '4px',
        zIndex: '9999', pointerEvents: 'none'
    });
    document.body.appendChild(debugPanel);
    updateDebugPanel();
}

function updateDebugPanel() {
    if (!DEBUG || !debugPanel) return;
    const headingTN = (typeof currentHeading === 'number') ? currentHeading.toFixed(1) : '-';
    const raw = (lastRawHeading !== null && !isNaN(lastRawHeading)) ? lastRawHeading.toFixed(1) : '-';
    debugPanel.innerHTML = `Heading(TN): ${headingTN}°<br>Raw: ${raw}°`;
}

window.addEventListener('load', initDebugPanel);

