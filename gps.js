// gps.js

let lastCompassHeading = null; 
// 修正方針 3: フィルター係数と更新閾値を調整
const HEADING_FILTER_ALPHA = 0.3; // フィルター係数 (0.0 - 1.0). 小さいほど滑らか
const HEADING_UPDATE_THRESHOLD = 5; // この角度(度)以上変化した場合のみ描画更新

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

    if (lastCompassHeading === null) {
        lastCompassHeading = rawHeading;
    }

    // 修正方針 3: より安定したフィルター処理
    // 最短距離での角度差を計算
    let diff = rawHeading - lastCompassHeading;
    if (diff > 180) { diff -= 360; }
    else if (diff < -180) { diff += 360; }
    
    // ローパスフィルターを適用
    let smoothedHeading = lastCompassHeading + diff * HEADING_FILTER_ALPHA;
    smoothedHeading = (smoothedHeading + 360) % 360;

    // 更新閾値を超えた場合のみ値を更新
    if (Math.abs(smoothedHeading - currentHeading) > HEADING_UPDATE_THRESHOLD) {
        currentHeading = smoothedHeading;
        lastCompassHeading = smoothedHeading;
    }
}


/**
 * GPSの位置情報取得が成功した際のコールバック関数。
 */
function handlePositionSuccess(position) {
    console.log(`[GPS] update ${position.coords.latitude.toFixed(6)} ${position.coords.longitude.toFixed(6)}`);
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

