// gps.js

// --- 調整可能パラメータ ---
const HEADING_FILTER_ALPHA = 0.3;       // 平滑化フィルタの係数 (小さいほど滑らか)
const HEARTBEAT_INTERVAL_MS = 1000;     // ハートビート間隔 (ms)
const COMPASS_TIMEOUT_MS = 10000;       // コンパスイベントのタイムアウト (ms)

// --- 内部変数 ---
let magneticDeclination = 0; // 磁気偏角
let heartbeatIntervalId = null;
let lastCurrentHeading = null; // 平滑化後の最終角度

// --- センサー起動と権限管理 ---

/**
 * センサー (GPSとコンパス) の起動を試みる
 */
function startSensors() {
    console.log('[DEBUG-WIRE] startSensors called');
    
    // GPSの起動
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(onGpsUpdate, handlePositionError, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
        console.log('[DEBUG-WIRE] gps listener attached');
    } else {
        console.error("[PERM] Geolocation is not supported by this browser.");
        dom.gpsStatus.textContent = "ブラウザ非対応";
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    }

    // コンパスの起動
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
         console.log('[DEBUG-WIRE] iOS device detected. Waiting for user gesture.');
         // iOSではユーザー操作を起点に許可を求める必要があるが、今回はボタンを削除したため自動では実行されない
    } else {
        attachCompassListener();
    }

    startHeartbeat();
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
}

/**
 * コンパスイベントリスナーをアタッチする
 */
function attachCompassListener() {
    console.log('[DEBUG-WIRE] Attempting to attach compass listener...');
    
    if ('AbsoluteOrientationSensor' in window) {
        try {
            const sensor = new AbsoluteOrientationSensor({ frequency: 60, referenceFrame: 'device' });
            sensor.addEventListener('reading', () => {
                const heading = 360 - sensor.quaternion[2] * 180 / Math.PI;
                onCompassUpdate({ alpha: heading, absolute: true });
            });
            sensor.addEventListener('error', (event) => {
                 console.error('[PERM] AbsoluteOrientationSensor error:', event.error.name, event.error.message);
                 window.addEventListener('deviceorientationabsolute', (e) => onCompassUpdate(e), true);
            });
            sensor.start();
            console.log('[DEBUG-WIRE] AbsoluteOrientationSensor attached');
        } catch(e) {
            console.error('[PERM] AbsoluteOrientationSensor construction failed:', e);
            window.addEventListener('deviceorientationabsolute', (e) => onCompassUpdate(e), true);
        }

    } else if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', (e) => onCompassUpdate(e), true);
        console.log('[DEBUG-WIRE] deviceorientationabsolute listener attached');
    } else if ('ondeviceorientation' in window) {
        window.addEventListener('deviceorientation', (e) => onCompassUpdate(e), true);
        console.log('[DEBUG-WIRE] deviceorientation listener attached');
    } else {
        console.error("[PERM] Compass API not supported.");
    }
}


// --- イベントハンドラ ---

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

function onCompassUpdate(event) {
    let rawHeadingValue = null;
    
    if (event.webkitCompassHeading !== undefined) {
        rawHeadingValue = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        rawHeadingValue = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (rawHeadingValue === null) return;
    
    lastRawHeading = rawHeadingValue; // グローバル変数に生の値を保持
    
    const trueHeading = (lastRawHeading + magneticDeclination + 360) % 360;

    if (lastCurrentHeading === null) {
        currentHeading = trueHeading;
    } else {
        let diff = trueHeading - lastCurrentHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        currentHeading = (lastCurrentHeading + diff * HEADING_FILTER_ALPHA + 360) % 360;
    }
    
    console.log(`[DEBUG-EVT] onCompassUpdate raw=${lastRawHeading.toFixed(1)} -> current=${currentHeading.toFixed(1)}`);
    
    lastCurrentHeading = currentHeading;

    if (!compassInitialized) {
        compassInitialized = true;
    }

    updateMapRotation(currentHeading);
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('[DEBUG-WIRE] page visible → reattach listeners');
        startHeartbeat(); 
    } else {
        stopHeartbeat(); 
    }
}

function handlePageShow(event) {
    if (event.persisted) {
        console.log('[DEBUG-WIRE] page show from bfcache → reattach listeners');
        startHeartbeat();
    }
}


// --- ハートビート ---

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
