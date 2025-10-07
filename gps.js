/**
 * gps.js
 * センサー（方位）の情報を取得し、アプリケーションの状態を更新する。
 * ログ出力の起点となる。
 */

/**
 * センサー（GPSとコンパス）の起動を試みる
 */
function startSensors() {
    // コンパス（方位センサー）の起動
    // 対応していないブラウザ（PCなど）の場合
    if (!('DeviceOrientationEvent' in window)) {
        updateHeadingState(null, 'unsupported');
        return;
    }

    // iOS 13以降ではユーザーの操作を起点に許可を求める必要がある
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // 本番実装ではボタンクリックなどでこの関数を呼び出す
        DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', onCompassUpdate);
                } else {
                    updateHeadingState(null, 'permission_denied');
                }
            })
            .catch(error => {
                 updateHeadingState(null, 'browser_limitation');
                 console.error(error);
            });
    } else {
        // Androidなど、許可が不要なデバイス
        window.addEventListener('deviceorientation', onCompassUpdate);
    }
}

/**
 * コンパスイベントハンドラ
 * @param {DeviceOrientationEvent} event
 */
function onCompassUpdate(event) {
    // webkitCompassHeadingが利用可能なら優先（iOS Safari）
    const heading = event.webkitCompassHeading || event.alpha;

    if (heading === null || isNaN(heading)) {
        // TODO: 精度不足(low_accuracy)や静止中(stationary)の判定をここに追加
        updateHeadingState(null, 'low_accuracy');
        return;
    }
    
    // 0-360度の範囲に正規化された方位角を更新
    updateHeadingState(360 - heading, null);
}

// -------------------------------------------------------------
// 以下の機能は今回のログ検証では直接使用しませんが、
// アプリ全体の動作のために残しています。
// -------------------------------------------------------------

// --- 調整可能パラメータ ---
const HEARTBEAT_INTERVAL_MS = 1000;
const COMPASS_TIMEOUT_MS = 10000;

// --- 内部変数 ---
let magneticDeclination = 0;
let heartbeatIntervalId = null;
let lastCurrentHeading = null;

function onGpsUpdate(position) {
    currentPosition = position;
    onPositionUpdate(position);
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    console.error(`[PERM] GPS Error: ${msg}`, error);
}

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
            updateMapRotation(currentHeading);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

