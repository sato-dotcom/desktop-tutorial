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
let lastCurrentHeading = null; // onCompassUpdate内での平滑化用に変更

// --- センサー起動と権限管理 ---

/**
 * センサー (GPSとコンパス) の起動を試みる
 */
function startSensors() {
    // console.log('[DEBUG-WIRE] startSensors called');
    
    // GPSの起動
    if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(onGpsUpdate, handlePositionError, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
        // console.log('[DEBUG-WIRE] gps listener attached');
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
         // console.log('[DEBUG-WIRE] iOS device detected. Waiting for user gesture.');
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
    // console.log('[DEBUG-WIRE] Attempting to attach compass listener...');
    
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
            // console.log('[DEBUG-WIRE] AbsoluteOrientationSensor attached');
        } catch(e) {
            console.error('[PERM] AbsoluteOrientationSensor construction failed:', e);
            window.addEventListener('deviceorientationabsolute', (e) => onCompassUpdate(e), true);
        }

    } else if ('ondeviceorientationabsolute' in window) {
        window.addEventListener('deviceorientationabsolute', (e) => onCompassUpdate(e), true);
        // console.log('[DEBUG-WIRE] deviceorientationabsolute listener attached');
    } else if ('ondeviceorientation' in window) {
        window.addEventListener('deviceorientation', (e) => onCompassUpdate(e), true);
        // console.log('[DEBUG-WIRE] deviceorientation listener attached');
    } else {
        console.error("[PERM] Compass API not supported.");
    }
}


// --- イベントハンドラ ---

function onGpsUpdate(position) {
    // ★★★ 修正: イベント発火を明確にログ出力 ★★★
    console.log(`[DEBUG-EVT] onGpsUpdate fired. lat=${position.coords.latitude.toFixed(4)}, lon=${position.coords.longitude.toFixed(4)}`);
    currentPosition = position;
    onPositionUpdate(position); // mapControllerへ通知
}

function handlePositionError(error) {
    let userMessage = "測位エラー";
    let errorCode = "UNKNOWN_ERROR";

    switch (error.code) {
        case error.PERMISSION_DENIED:
            userMessage = "位置情報の許可が必要です";
            errorCode = "PERMISSION_DENIED";
            break;
        case error.POSITION_UNAVAILABLE:
            userMessage = "位置情報を取得できません";
            errorCode = "POSITION_UNAVAILABLE";
            break;
        case error.TIMEOUT:
            userMessage = "測位がタイムアウトしました";
            errorCode = "TIMEOUT";
            break;
    }
    
    // ★★★ 修正: 詳細なエラーログとUI表示 ★★★
    console.error(`[DEBUG-ERR] Geolocation error: ${errorCode} - ${error.message}`);
    dom.gpsStatus.textContent = userMessage;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
}

function onCompassUpdate(event) {
    // ★★★ 修正: イベント発火を明確にログ出力 ★★★
    console.log(`[DEBUG-EVT] onCompassUpdate fired.`);
    let rawHeading = null;
    
    if (event.webkitCompassHeading !== undefined) { // Safari
        rawHeadingValue = event.webkitCompassHeading;
    } else if (event.alpha !== null) { // その他
        // absolute: true であれば、alphaは真北基準。そうでなければ端末の向き基準なので補正
        rawHeadingValue = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null) return;
    
    lastCompassEventTime = Date.now();
    
    // 真北補正（現時点では磁気偏角は0）
    const trueHeading = (rawHeadingValue + magneticDeclination + 360) % 360;

    // 平滑化フィルタ
    if (lastCurrentHeading !== null) {
        // -180〜+180の差分を計算して最短経路で平滑化
        let diff = trueHeading - lastCurrentHeading;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;
        currentHeading = (lastCurrentHeading + diff * HEADING_FILTER_ALPHA + 360) % 360;
    } else {
        currentHeading = trueHeading;
    }
    
    // ★★★ 修正依頼: ログ出力の追加 ★★★
    console.log(`[DEBUG-EVT] onCompassUpdate raw=${trueHeading.toFixed(1)}, current=${currentHeading.toFixed(1)}`);
    
    lastRawHeading = trueHeading; // 真北補正後の値を保持
    lastCurrentHeading = currentHeading; // 平滑化後の値を次回の計算用に保持

    if (!compassInitialized && typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
        compassInitialized = true;
        // console.log(`[DEBUG-INIT] first raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)} → applied`);
        updateMapRotation(lastRawHeading, currentHeading); // 初回呼び出し
    }

    // ★★★ 修正依頼: ログ出力付きで mapController を呼び出し ★★★
    const logForController = `[DEBUG-RM2] raw=${lastRawHeading?.toFixed(1)} current=${currentHeading?.toFixed(1)}`;
    console.log(logForController);
    updateMapRotation(lastRawHeading, currentHeading);
}


function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        // console.log('[DEBUG-WIRE] page visible → reattach listeners');
        // 必要に応じてリスナーを再アタッチ
        startHeartbeat(); // ハートビートを再開
    } else {
        stopHeartbeat(); // バックグラウンドでは停止
    }
}

function handlePageShow(event) {
    if (event.persisted) {
        // console.log('[DEBUG-WIRE] page show from bfcache → reattach listeners');
        startHeartbeat();
    }
}


// --- ハートビート ---

function startHeartbeat() {
    if (heartbeatIntervalId) clearInterval(heartbeatIntervalId);
    heartbeatIntervalId = setInterval(() => {
        heartbeatTicks++;
        if (typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
             // console.log(`[DEBUG-HB] tick raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)}`);
             updateMapRotation(lastRawHeading, currentHeading);
        }
        if (Date.now() - lastCompassEventTime > COMPASS_TIMEOUT_MS) {
            // console.warn(`[WARN-HB] no compass events ${COMPASS_TIMEOUT_MS/1000}s`);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
    if (heartbeatIntervalId) {
        clearInterval(heartbeatIntervalId);
        heartbeatIntervalId = null;
    }
}


