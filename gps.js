// gps.js

let lastCompassHeading = null;
const HEADING_FILTER_ALPHA = 0.3; // フィルター係数 (0.0 - 1.0). 小さいほど滑らか
const HEADING_UPDATE_THRESHOLD = 1; // 更新閾値（度）。1度程度の揺れは許容する。
const HEADING_SPIKE_THRESHOLD = 45; // これ以上の急な変化はスパイクとして無視する（度）

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
 * スパイク除去と平滑化フィルターを適用します。
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
        currentHeading = rawHeading;
        return;
    }

    // 修正方針 1: 大きな回転の抑制 (スパイク除去)
    let diff = rawHeading - lastCompassHeading;
    // 角度差を-180〜+180の範囲に正規化
    if (Math.abs(diff) > 180) {
        diff = diff > 0 ? diff - 360 : diff + 360;
    }
    if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD) {
        console.log(`[Compass] Spike detected: ${diff.toFixed(1)}°. Ignoring.`);
        return; // 閾値を超える急な変化は無視
    }
    lastCompassHeading = rawHeading;


    // 修正方針 2: 回転方向の補正 (最短経路での差分計算)
    let targetDiff = rawHeading - currentHeading;
    if (targetDiff > 180) { targetDiff -= 360; }
    if (targetDiff < -180) { targetDiff += 360; }

    // ローパスフィルターを適用して滑らかにする
    let newHeading = currentHeading + targetDiff * HEADING_FILTER_ALPHA;

    // 更新閾値を超えた場合のみ値を更新（微小な揺れを無視）
    if (Math.abs(newHeading - currentHeading) > HEADING_UPDATE_THRESHOLD) {
         currentHeading = (newHeading + 360) % 360;
    }
}


/**
 * GPSの位置情報取得が成功した際のコールバック関数。
 */
function handlePositionSuccess(position) {
    // 修正方針1: GPS更新時にログを出力
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

