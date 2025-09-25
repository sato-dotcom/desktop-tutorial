// gps.js

// --- 調整可能パラメータ ---
const HEADING_FILTER_ALPHA = 0.3;       // 平滑化フィルタの係数 (小さいほど滑らか)
const HEADING_UPDATE_THRESHOLD = 1.0;   // 更新とみなす最小角度変化 (度)
const HEARTBEAT_INTERVAL_MS = 1000;     // ハートビート間隔 (ms)
const COMPASS_TIMEOUT_MS = 10000;       // コンパスイベントのタイムアウト (ms)

// --- 内部変数 ---
let magneticDeclination = 0; // 磁気偏角
let compassUpdateTimer = null;
let heartbeatIntervalId = null;

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
    // iOS 13+ はユーザージェスチャ内の権限リクエストが必須
    // Androidは通常リクエスト不要
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS 13+ の処理は `startSensorsBtn` のクリックイベントハンドラで行う
         console.log('[DEBUG-WIRE] iOS device detected. Waiting for user gesture.');
    } else {
        // Android やその他のデバイス
        attachCompassListener();
    }

    // ハートビートを開始
    startHeartbeat();

    // ページ表示状態の変更を監視
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pageshow', handlePageShow);
}

/**
 * コンパスイベントリスナーをアタッチする
 */
function attachCompassListener() {
    console.log('[DEBUG-WIRE] Attempting to attach compass listener...');
    
    const options = { absolute: true };
    
    if ('AbsoluteOrientationSensor' in window) {
        try {
            const sensor = new AbsoluteOrientationSensor({ frequency: 60, referenceFrame: 'device' });
            sensor.addEventListener('reading', () => {
                // webkitCompassHeading と同じ0=北, 90=東になるように変換
                const heading = 360 - sensor.quaternion[2] * 180 / Math.PI;
                onCompassUpdate({ alpha: heading, absolute: true });
            });
            sensor.addEventListener('error', (event) => {
                 console.error('[PERM] AbsoluteOrientationSensor error:', event.error.name, event.error.message);
                 // フォールバック
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
    console.log(`[DEBUG-EVT] onGpsUpdate lat=${position.coords.latitude.toFixed(4)}, lon=${position.coords.longitude.toFixed(4)}`);
    currentPosition = position;
    onPositionUpdate(position); // mapControllerへ通知
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
    let rawHeading = null;
    
    if (event.webkitCompassHeading !== undefined) { // Safari
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) { // その他
        rawHeading = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null) return;
    
    lastCompassEventTime = Date.now();
    
    const trueHeading = (rawHeading + magneticDeclination + 360) % 360;

    if (lastRawHeading !== null) {
        let diff = trueHeading - lastCurrentHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        currentHeading = (lastCurrentHeading + diff * HEADING_FILTER_ALPHA + 360) % 360;
    } else {
        currentHeading = trueHeading;
    }

    console.log(`[DEBUG-EVT] onCompassUpdate raw=${rawHeading.toFixed(1)} current=${currentHeading.toFixed(1)}`);
    
    lastRawHeading = rawHeading;
    lastCurrentHeading = currentHeading;

    if (!compassInitialized && typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
        compassInitialized = true;
        console.log(`[DEBUG-INIT] first raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)} → applied`);
        updateMapRotation(lastRawHeading, currentHeading);
        updateMapRotation(lastRawHeading, currentHeading); // 冗長呼び出し
    }

    updateMapRotation(lastRawHeading, currentHeading);
}

function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log('[DEBUG-WIRE] page visible → reattach listeners');
        // 必要に応じてリスナーを再アタッチ
        startHeartbeat(); // ハートビートを再開
    } else {
        stopHeartbeat(); // バックグラウンドでは停止
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
        if (typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
             console.log(`[DEBUG-HB] tick raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)}`);
             updateMapRotation(lastRawHeading, currentHeading);
        }
        if (Date.now() - lastCompassEventTime > COMPASS_TIMEOUT_MS) {
            console.warn(`[WARN-HB] no compass events ${COMPASS_TIMEOUT_MS/1000}s`);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}

