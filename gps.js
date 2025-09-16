// gps.js

let lastCompassHeading = null;
const HEADING_FILTER_ALPHA = 0.3; // フィルター係数 (0.0 - 1.0). 小さいほど滑らか
const HEADING_UPDATE_THRESHOLD = 1; // 更新閾値（度）。1度程度の揺れは許容する。
const HEADING_SPIKE_THRESHOLD = 45; // これ以上の急な変化はスパイクとして無視する（度）
let currentDeclination = 0; // 現在地の磁気偏角（度）

// --- 磁北→真北補正ユーティリティ ---
/**
 * 磁北を真北に変換します。
 * @param {number} magneticHeading - 磁北基準の方位（度）
 * @param {number} declination - 磁気偏角（度）
 * @returns {number | null} 真北基準の方位（度）
 */
function toTrueNorth(magneticHeading, declination) {
    if (magneticHeading === null || isNaN(magneticHeading)) return null;
    let trueHeading = magneticHeading + declination;
    return (trueHeading + 360) % 360;
}

// --- 国土地理院APIから磁偏角を取得 ---
/**
 * 指定された緯度経度における磁気偏角を国土地理院のAPIから取得します。
 * @param {number} lat - 緯度
 * @param {number} lon - 経度
 * @returns {Promise<number>} 磁気偏角（度）。失敗時は0を返す。
 */
async function fetchDeclination(lat, lon) {
    try {
        const url = `https://vldb.gsi.go.jp/sokuchi/geomag/api/declination?lat=${lat}&lon=${lon}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        // APIからの値が数値であることを確認
        if (data && typeof data.declination === 'number') {
            return data.declination;
        }
        console.error("磁偏角APIの応答形式が不正です:", data);
        return 0;
    } catch (err) {
        console.error("磁偏角取得エラー:", err);
        return 0; // 取得失敗時は補正なし
    }
}


/**
 * GPSの測位を開始します。
 */
function startGeolocation() {
    if (!navigator.geolocation) {
        dom.gpsStatus.textContent = "ブラウザが非対応です";
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
        return;
    }
    console.log("--- 🛰️ Starting Geolocation ---");
    watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

/**
 * コンパス（方位センサー）を開始します。
 */
function startCompass() {
    const addListeners = () => {
        console.log("--- 🧭 Requesting compass permissions ---");
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', onCompassUpdate, true);
                    }
                }).catch(console.error);
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

/**
 * コンパスの方位データが更新されたときに呼び出されます。
 * 磁北を真北に補正し、スパイク除去と平滑化フィルターを適用します。
 * @param {DeviceOrientationEvent} event - デバイスの向きに関するイベント情報
 */
function onCompassUpdate(event) {
    let rawHeading = null;

    if (event.webkitCompassHeading) {
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        rawHeading = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null) return;

    // ★★★ 修正点: 磁北から真北への変換を適用 ★★★
    const trueHeading = toTrueNorth(rawHeading, currentDeclination);
    if (trueHeading === null) return;

    if (lastCompassHeading === null) {
        lastCompassHeading = trueHeading;
        currentHeading = trueHeading;
        return;
    }

    // スパイク除去：急激な値の変化を無視 (真北基準で計算)
    let diff = trueHeading - lastCompassHeading;
    if (Math.abs(diff) > 180) { // 350度 -> 10度のような変化に対応
        diff = diff > 0 ? diff - 360 : diff + 360;
    }
    if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD) {
        console.log(`[Compass] Spike detected: ${diff.toFixed(1)}°. Ignoring.`);
        return; // 閾値を超える急な変化は無視
    }
    lastCompassHeading = trueHeading;


    // 最短回転：現在の表示角度との差を計算 (真北基準で計算)
    let targetDiff = trueHeading - currentHeading;
    if (targetDiff > 180) { targetDiff -= 360; }
    if (targetDiff < -180) { targetDiff += 360; }

    // フィルター：新しい角度を滑らかに計算
    let newHeading = currentHeading + targetDiff * HEADING_FILTER_ALPHA;

    // 更新閾値：微小な変化は無視
    if (Math.abs(newHeading - currentHeading) > HEADING_UPDATE_THRESHOLD) {
         currentHeading = (newHeading + 360) % 360;
    }
}


/**
 * GPSの位置情報取得が成功した際のコールバック関数。
 * ★★★ 修正点: 磁気偏角を非同期で取得する処理を追加 ★★★
 */
function handlePositionSuccess(position) {
    console.log(`[GPS] update ${position.coords.latitude.toFixed(6)} ${position.coords.longitude.toFixed(6)}`);

    // 位置情報が更新されるたびに磁気偏角を取得
    const { latitude, longitude } = position.coords;
    fetchDeclination(latitude, longitude).then(decl => {
        currentDeclination = decl;
        console.log(`磁偏角更新: ${decl.toFixed(2)}° (真北補正に使用)`);
    });

    // mapControllerの更新関数を呼び出す
    onPositionUpdate(position);
}

/**
 * GPSの位置情報取得が失敗した際のコールバック関数。
 */
function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    console.error(`GPS Error: ${msg}`, error);
}
