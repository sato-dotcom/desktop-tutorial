// gps.js

// --- 調整可能パラメータ ---
const HEADING_FILTER_ALPHA = 0.3; // 平滑化フィルタの係数 (0.1-0.5)
const HEADING_UPDATE_THRESHOLD = 0.5; // 更新とみなす最小角度変化
const HEARTBEAT_INTERVAL_MS = 1000; // ハートビート間隔
const SENSOR_TIMEOUT_MS = 10000; // センサー無反応とみなす時間

// --- 状態変数 ---
let compassInitialized = false;
let lastCompassEventTimestamp = 0;
let heartbeatInterval = null;
let heartbeatTicks = 0;

// --- センサーイベントの配線と開始 ---
function startSensors() {
    console.log('[DEBUG-WIRE] startSensors called');
    
    const addListeners = () => {
        // Compass
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(state => {
                    if (state === 'granted') {
                        window.addEventListener('deviceorientation', onCompassUpdate, true);
                        console.log('[DEBUG-WIRE] compass listener attached (iOS)');
                    } else {
                        console.warn('[PERM] Compass permission denied');
                    }
                }).catch(err => console.error('[PERM] Compass permission request error:', err));
        } else {
             if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', onCompassUpdate, true);
             } else {
                window.addEventListener('deviceorientation', onCompassUpdate, true);
             }
             console.log('[DEBUG-WIRE] compass listener attached (Android/PC)');
        }
        
        // GPS
        if (navigator.geolocation) {
            watchId = navigator.geolocation.watchPosition(onGpsUpdate, handlePositionError, {
                enableHighAccuracy: true, timeout: 10000, maximumAge: 0
            });
            console.log('[DEBUG-WIRE] gps listener attached');
        } else {
             console.warn('[PERM] GPS unavailable');
        }
    };
    
    // ユーザー操作を待ってセンサーを開始
    document.body.addEventListener('click', addListeners, { once: true });
    
    // ハートビートを開始
    startHeartbeat();
}


function onGpsUpdate(position) {
    console.log(`[DEBUG-EVT] onGpsUpdate lat=${position.coords.latitude.toFixed(4)}, lon=${position.coords.longitude.toFixed(4)}`);
    onPositionUpdate(position); // mapControllerへ
}

function handlePositionError(error) { /* ... (内容は変更なし) ... */ let msg = "測位エラー"; if (error.code === 1) msg = "アクセス拒否"; if (error.code === 2) msg = "測位不可"; if (error.code === 3) msg = "タイムアウト"; dom.gpsStatus.textContent = msg; dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs'; console.error(`GPS Error: ${msg}`, error); }

function onCompassUpdate(event) {
    let rawHeading = null;
    if (event.webkitCompassHeading !== undefined) { // iOS
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) { // Android/PC
        rawHeading = (event.absolute === true) ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null || isNaN(rawHeading)) return;
    
    console.log(`[DEBUG-EVT] onCompassUpdate raw=${rawHeading.toFixed(1)}`);
    
    lastCompassEventTimestamp = Date.now();
    lastRawHeading = rawHeading;
    
    // 平滑化フィルタと真北計算
    if (currentHeading === null) {
        currentHeading = rawHeading;
    } else {
        let diff = normalizeDeg(rawHeading - currentHeading);
        currentHeading = (currentHeading + diff * HEADING_FILTER_ALPHA + 360) % 360;
    }

    // 初期化処理
    if (!compassInitialized && typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
        compassInitialized = true;
        console.log(`[DEBUG-INIT] first raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)} → applied`);
        updateMapRotation(lastRawHeading, currentHeading);
        updateMapRotation(lastRawHeading, currentHeading); // 冗長呼び出し
    } else {
        // 通常更新
        updateMapRotation(lastRawHeading, currentHeading);
    }
}

function startHeartbeat() {
    if (heartbeatInterval) clearInterval(heartbeatInterval);
    heartbeatInterval = setInterval(() => {
        heartbeatTicks++;
        if (typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
             console.log(`[DEBUG-HB] tick raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)}`);
             updateMapRotation(lastRawHeading, currentHeading);
        }
        
        if (Date.now() - lastCompassEventTimestamp > SENSOR_TIMEOUT_MS) {
            console.warn(`[WARN-HB] no compass events ${SENSOR_TIMEOUT_MS/1000}s`);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

