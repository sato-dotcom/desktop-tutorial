// gps.js

const DEBUG = false; // デバッグログを有効にする場合はtrueに設定
const HEADING_FILTER_ALPHA = 0.3; // フィルター係数 (0.0 - 1.0). 小さいほど滑らか
const HEADING_UPDATE_THRESHOLD = 1; // 更新閾値（度）。1度程度の揺れは許容する。
const HEADING_SPIKE_THRESHOLD = 45; // これ以上の急な変化はスパイクとして無視する（度）

// 磁気偏角APIの更新条件
const DECLINATION_UPDATE_DISTANCE_M = 1000; // この距離(m)以上移動したら更新
const DECLINATION_UPDATE_INTERVAL_MS = 3 * 60 * 60 * 1000; // 3時間ごとに更新

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

// 状態変数
let currentDeclination = 0;
let lastDeclinationUpdatePos = null;
let lastDeclinationUpdateAt = 0;
let lastCompassHeading = null;

// --- ユーティリティ関数 ---

/**
 * 磁北を真北に変換します。
 * @param {number} magneticHeading - 磁北基準の方位（度）
 * @param {number} declination - 磁気偏角（度）
 * @returns {number | null} 真北基準の方位（度）
 */
function toTrueNorth(magneticHeading, declination) {
    if (magneticHeading === null || isNaN(magneticHeading)) return null;
    return (magneticHeading + declination + 360) % 360;
}

/**
 * 2点間の距離をメートルで計算します（球面三角法）。
 */
function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000; // 地球の半径 (メートル)
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * 緯度経度から最も近いJGD2011の系番号を判定します。
 */
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

/**
 * 磁気偏角を更新すべきかどうかを判定します。
 */
function shouldUpdateDeclination(lat, lon) {
    const now = Date.now();
    if (!lastDeclinationUpdatePos) return true; // 初回
    if (now - lastDeclinationUpdateAt > DECLINATION_UPDATE_INTERVAL_MS) return true; // 時間経過
    return getDistanceMeters(lastDeclinationUpdatePos.lat, lastDeclinationUpdatePos.lon, lat, lon) > DECLINATION_UPDATE_DISTANCE_M; // 距離移動
}

/**
 * 国土地理院APIから磁気偏角を取得します。
 */
async function fetchDeclination(lat, lon) {
    const url = `https://vldb.gsi.go.jp/sokuchi/geomag/api/declination?lat=${lat}&lon=${lon}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (typeof data.declination !== 'number') throw new Error("Invalid API response");
    return data.declination;
}

/**
 * 必要に応じて磁気偏角を更新します。
 * API取得に失敗した場合は、系番号に応じた代表値でフォールバックします。
 */
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


// --- GPS関連 ---

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
    // 磁気偏角を更新してから、位置情報の処理を行う
    updateDeclinationIfNeeded(latitude, longitude);
    onPositionUpdate(position); // mapController.js の関数を呼び出す
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

// --- コンパス関連 ---

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
    let rawHeading = null;
    if (event.webkitCompassHeading !== undefined) {
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        rawHeading = event.absolute ? event.alpha : 360 - event.alpha;
    }
    if (rawHeading === null || isNaN(rawHeading)) return;

    // 常に真北に補正してから処理
    const trueHeading = toTrueNorth(rawHeading, currentDeclination);
    if (trueHeading === null) return;

    if (lastCompassHeading === null) {
        lastCompassHeading = trueHeading;
        currentHeading = trueHeading;
        if (DEBUG) console.log(`[Compass] init ${trueHeading.toFixed(1)}° (TN)`);
        return;
    }

    // スパイク除去
    let diff = trueHeading - lastCompassHeading;
    if (Math.abs(diff) > 180) diff = diff > 0 ? diff - 360 : diff + 360;
    if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD) {
        if (DEBUG) console.log(`[Compass] Spike ${diff.toFixed(1)}° ignored`);
        return;
    }
    lastCompassHeading = trueHeading;

    // 平滑化フィルター
    let targetDiff = trueHeading - currentHeading;
    if (targetDiff > 180) targetDiff -= 360;
    if (targetDiff < -180) targetDiff += 360;

    const newHeading = currentHeading + targetDiff * HEADING_FILTER_ALPHA;
    if (Math.abs(newHeading - currentHeading) > HEADING_UPDATE_THRESHOLD) {
        currentHeading = (newHeading + 360) % 360;
        if (DEBUG) console.log(`[Compass] update -> ${currentHeading.toFixed(1)}° (TN)`);
    }
}

