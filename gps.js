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
    watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

/**
 * コンパス（方位センサー）を開始します。
 */
function startCompass() {
    const addListeners = () => {
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
 * ★★★ 3) 方位センサーのフィルタリングを強化 ★★★
 * コンパスの方位データが更新されたときに呼び出されます。
 * @param {DeviceOrientationEvent} event - デバイスの向きに関するイベント情報
 */
function onCompassUpdate(event) {
    let rawHeading = null;
    
    // iOS/iPadOS 13+ と Android Chrome で 'alpha' の基準が異なるため、
    // 'webkitCompassHeading' があれば最優先で利用する
    if (event.webkitCompassHeading) { // For iOS
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) { // For Android
        rawHeading = event.absolute ? event.alpha : 360 - event.alpha; // Androidでは北が0度になるように調整
    }

    if (rawHeading === null) return;

    if (lastCompassHeading === null) {
        lastCompassHeading = rawHeading;
    }

    // --- Low-pass filter (平滑化) ---
    let smoothedHeading = HEADING_FILTER_ALPHA * rawHeading + (1 - HEADING_FILTER_ALPHA) * lastCompassHeading;
    
    // --- Shortest path interpolation (最短回転補間) ---
    let diff = smoothedHeading - lastCompassHeading;
    if (diff > 180) {
        lastCompassHeading += 360;
    } else if (diff < -180) {
        lastCompassHeading -= 360;
    }
    // 再度平滑化
    smoothedHeading = HEADING_FILTER_ALPHA * smoothedHeading + (1 - HEADING_FILTER_ALPHA) * lastCompassHeading;
    
    // --- Update threshold (更新閾値) ---
    const change = Math.abs(smoothedHeading - currentHeading);
    if (change < HEADING_UPDATE_THRESHOLD && change > 0.1) { // 0.1は静止時の微振動を許容するため
        return;
    }

    currentHeading = (smoothedHeading + 360) % 360;
    lastCompassHeading = smoothedHeading;
}


/**
 * GPSの位置情報取得が成功した際のコールバック関数。
 * 処理の大部分を onPositionUpdate に移譲。
 */
function handlePositionSuccess(position) {
    onPositionUpdate(position);
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
}

