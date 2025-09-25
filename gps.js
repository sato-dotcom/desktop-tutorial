// gps.js

// --- 調整可能パラメータ ---
const HEADING_SPIKE_THRESHOLD_GPS = 45; // 角度の急な変化（スパイク）と見なす閾値（度）
const LOG_THROTTLE_MS = 500; // デバッグUIの更新頻度（ミリ秒）

// --- 内部状態変数 ---
let lastCompassEventTime = 0;


// --- センサーとイベントの初期化 ---

/**
 * センサー（GPSとコンパス）の権限要求とイベントリスナーを開始する
 * @returns {Promise<void>}
 */
async function startSensors() {
    console.log("[DEBUG-WIRE] startSensors called");
    
    // イベントリスナーを一度クリアして多重登録を防ぐ
    stopSensors();
    
    try {
        // 1. コンパス権限要求とリスナー登録
        await setupCompassListener();
        console.log("[DEBUG-WIRE] compass listener attached");

        // 2. GPSリスナー登録
        setupGpsListener();
        console.log("[DEBUG-WIRE] gps listener attached");

        // 3. ハートビート開始
        setupHeartbeat();
        
    } catch (err) {
        console.error("[PERM] Sensor permission or setup failed:", err);
        alert("センサーの権限が拒否されたか、利用できません。設定を確認してください。");
        // 権限がなくても、後で許可される可能性を考慮し、処理は続行
    }
}

/**
 * 既存のセンサーリスナーとインターバルを停止する
 */
function stopSensors() {
    window.removeEventListener('deviceorientationabsolute', onCompassUpdate, true);
    window.removeEventListener('deviceorientation', onCompassUpdate, true);
    if (watchId) navigator.geolocation.clearWatch(watchId);
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    watchId = null;
    heartbeatInterval = null;
}


/**
 * コンパスの権限を要求し、イベントリスナーを設定する
 * @returns {Promise<void>}
 */
async function setupCompassListener() {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state === 'granted') {
            window.addEventListener('deviceorientation', onCompassUpdate, true);
        } else {
            throw new Error('Compass permission denied');
        }
    } else {
        const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
        window.addEventListener(eventName, onCompassUpdate, true);
    }
}

/**
 * GPSのイベントリスナーを設定する
 */
function setupGpsListener() {
    if (!navigator.geolocation) {
        dom.gpsStatus.textContent = "ブラウザが非対応です";
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
        throw new Error("Geolocation not supported");
    }
    watchId = navigator.geolocation.watchPosition(onGpsUpdate, handlePositionError, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
    });
}

/**
 * ハートビート（定期実行）を設定する
 */
function setupHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        heartbeatTicks++;
        console.log(`[DEBUG-HB] tick raw=${lastRawHeading?.toFixed(1)} current=${currentHeading?.toFixed(1)}`);
        
        // センサーイベントが10秒間なければ警告
        if (Date.now() - lastCompassEventTime > 10000) {
            console.warn(`[WARN-HB] no compass events 10s`);
        }
        
        // ハートビートでも回転更新を呼び出し、無反応を防ぐ
        updateMapRotation(lastRawHeading, currentHeading);

    }, 1000); // 1秒ごとに実行
}

// --- イベントハンドラ ---

/**
 * コンパスセンサーの値が更新されたときに呼ばれる
 * @param {DeviceOrientationEvent} event
 */
function onCompassUpdate(event) {
    lastCompassEventTime = Date.now();
    let rawHeading = null;
    if (event.webkitCompassHeading !== undefined) { // iOS
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) { // Android
        rawHeading = (event.absolute === true) ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null) return;
    
    // 磁北から真北への補正（磁気偏角）
    // Note: このデモでは簡単のため磁気偏角を0と仮定。実際にはAPI等で取得する。
    const trueHeading = rawHeading; 
    
    console.log(`[DEBUG-EVT] onCompassUpdate raw=${rawHeading.toFixed(1)} current=${trueHeading.toFixed(1)}`);
    
    // グローバル変数を更新
    lastRawHeading = rawHeading;
    currentHeading = trueHeading;
    
    // 初回有効値の検出と強制適用
    if (!compassInitialized && typeof rawHeading === 'number' && typeof trueHeading === 'number') {
        compassInitialized = true;
        console.log(`[DEBUG-INIT] first raw=${rawHeading.toFixed(1)} current=${trueHeading.toFixed(1)} → applied`);
        updateMapRotation(rawHeading, trueHeading);
        updateMapRotation(rawHeading, trueHeading); // 冗長呼び出しで確実化
    }
    
    // 通常の回転更新
    updateMapRotation(rawHeading, trueHeading);
}


/**
 * GPSの位置情報が更新されたときに呼ばれる
 * @param {GeolocationPosition} position
 */
function onGpsUpdate(position) {
    const { latitude, longitude } = position.coords;
    console.log(`[DEBUG-EVT] onGpsUpdate lat=${latitude.toFixed(4)}, lon=${longitude.toFixed(4)}`);
    
    // 測位ステータスを「GPS受信中」に更新
    if (dom.gpsStatus.textContent !== "GPS受信中") {
        dom.gpsStatus.textContent = "GPS受信中";
        dom.gpsStatus.className = 'bg-green-100 text-green-800 px-2 py-1 rounded-full font-mono text-xs';
    }

    onPositionUpdate(position); // mapControllerへ処理を委譲
}

/**
 * GPSのエラーハンドラ
 * @param {GeolocationPositionError} error
 */
function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    console.error(`[PERM] GPS Error: ${msg}`, error);
}

