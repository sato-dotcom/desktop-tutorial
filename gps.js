// gps.js

let lastCompassHeading = null; // for filtering
const HEADING_FILTER_ALPHA = 0.2; // for low-pass filter
const HEADING_UPDATE_THRESHOLD = 3; // in degrees

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
        // iOS 13+
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        window.addEventListener('deviceorientation', onCompassUpdate, true);
                    }
                }).catch(console.error);
        } else {
            // Android and other browsers
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', onCompassUpdate, true);
            } else {
                 window.addEventListener('deviceorientation', onCompassUpdate, true);
            }
        }
    };
    
    // ユーザーの初回アクション（クリック）をトリガーに許可を求める
    document.body.addEventListener('click', addListeners, { once: true });
}

/**
 * コンパスの方位データが更新されたときに呼び出されます。
 * @param {DeviceOrientationEvent} event - デバイスの向きに関するイベント情報
 */
function onCompassUpdate(event) {
    let rawHeading = null;
    
    if (event.webkitCompassHeading) { // For iOS
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) { // For Android
        rawHeading = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null) return;

    if (lastCompassHeading === null) {
        lastCompassHeading = rawHeading;
    }

    let diff = rawHeading - lastCompassHeading;
    if (diff > 180) { diff -= 360; }
    else if (diff < -180) { diff += 360; }
    
    let smoothedHeading = lastCompassHeading + diff * HEADING_FILTER_ALPHA;
    smoothedHeading = (smoothedHeading + 360) % 360;

    if (Math.abs(smoothedHeading - currentHeading) > HEADING_UPDATE_THRESHOLD) {
        currentHeading = smoothedHeading;
        lastCompassHeading = smoothedHeading;
    }
}


/**
 * GPSの位置情報取得が成功した際のコールバック関数。
 */
function handlePositionSuccess(position) {
    // 修正方針 1: ログ出力
    console.log(`[GPS] update ${position.coords.latitude} ${position.coords.longitude}`);
    // 処理の本体は mapController.js の onPositionUpdate に移譲
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
