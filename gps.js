/**
 * gps.js
 * センサー（GPS・方位）の情報を取得し、アプリケーションの状態を更新する。
 * 状態管理(state.js)の関数を呼び出す起点となる。
 */

/**
 * センサー（GPSとコンパス）の起動を試みる
 */
function startSensors() {
    // --- GPS (位置情報) の起動 ---
    if ('geolocation' in navigator) {
        // watchPositionで位置情報の継続的な取得を開始
        watchId = navigator.geolocation.watchPosition(
            onGpsSuccess, // 成功時のコールバック
            handlePositionError, // エラー時のコールバック
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        // GPSが利用できない環境の場合
        handlePositionError({ code: 2, message: "Geolocation is not supported by this browser." });
    }

    // --- コンパス（方位センサー）の起動 ---
    if (!('DeviceOrientationEvent' in window)) {
        setHeading(null, 'unsupported');
        return;
    }

    // iOS 13以降ではユーザーの操作を起点に許可を求める必要がある
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // TODO: 本番実装ではUIのボタンクリックなどでこの関数を呼び出すのが望ましい
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', onHeadingUpdate);
                } else {
                    setHeading(null, 'permission_denied');
                }
            })
            .catch(error => {
                 setHeading(null, 'browser_limitation');
                 console.error("DeviceOrientationEvent.requestPermission error:", error);
            });
    } else {
        // Androidなど、許可が不要なデバイス
        window.addEventListener('deviceorientation', onHeadingUpdate);
    }
}

/**
 * GPS測位成功時のイベントハンドラ
 * @param {GeolocationPosition} position
 */
function onGpsSuccess(position) {
    // 状態管理モジュールに位置情報を渡す
    setPosition(position);
}

/**
 * コンパスイベントハンドラ
 * @param {DeviceOrientationEvent} event
 */
function onHeadingUpdate(event) {
    // webkitCompassHeadingが利用可能なら優先（iOS Safari）
    const heading = event.webkitCompassHeading || event.alpha;

    if (heading === null || isNaN(heading)) {
        setHeading(null, 'low_accuracy');
        return;
    }
    
    // 0-360度の範囲に正規化された方位角を更新
    setHeading(360 - heading, null);
}

/**
 * GPS測位エラー時のハンドラ
 * @param {GeolocationPositionError} error
 */
function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    
    if (dom.gpsStatus) {
        dom.gpsStatus.textContent = msg;
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    }
    logJSON('gps.js', 'gps_error', { code: error.code, message: error.message });
}

// -------------------------------------------------------------
// 以下の機能は今回のログ検証では直接使用しませんが、
// アプリ全体の動作のために残しています。
// -------------------------------------------------------------
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        startHeartbeat();
    } else {
        stopHeartbeat();
    }
}

function handlePageShow(event) {
    if (event.persisted) {
        startHeartbeat();
    }
}

function startHeartbeat() {
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = setInterval(() => {
        heartbeatTicks++;
        if (compassInitialized) {
            updateHeading(appState.heading);
        }
    }, 1000);
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}
