// gps.js

// --- 調整可能パラメータ ---
const HEADING_FILTER_ALPHA = 0.3; 
const HEARTBEAT_INTERVAL_MS = 1000;
const SENSOR_TIMEOUT_MS = 10000;

// --- 状態変数 ---
let compassInitialized = false;
let lastCompassEventTimestamp = 0;
let heartbeatInterval = null;
let heartbeatTicks = 0;

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
    
    document.body.addEventListener('click', addListeners, { once: true });
    
    startHeartbeat();
}


function onGpsUpdate(position) {
    console.log(`[DEBUG-EVT] onGpsUpdate lat=${position.coords.latitude.toFixed(4)}, lon=${position.coords.longitude.toFixed(4)}`);
    onPositionUpdate(position);
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
    console.error(`GPS Error: ${msg}`, error);
}

function onCompassUpdate(event) {
    let rawHeading = null;
    if (event.webkitCompassHeading !== undefined) {
        rawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        rawHeading = (event.absolute === true) ? event.alpha : 360 - event.alpha;
    }

    if (rawHeading === null || isNaN(rawHeading)) return;
    
    lastCompassEventTimestamp = Date.now();
    lastRawHeading = rawHeading;
    
    if (currentHeading === null) {
        currentHeading = rawHeading;
    } else {
        let diff = normalizeDeg(rawHeading - currentHeading);
        currentHeading = (currentHeading + diff * HEADING_FILTER_ALPHA + 360) % 360;
    }
    
    console.log(`[DEBUG-EVT] onCompassUpdate raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)}`);


    if (!compassInitialized && typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
        compassInitialized = true;
        console.log(`[DEBUG-INIT] first raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)} → applied`);
        updateMapRotation(lastRawHeading, currentHeading);
        updateMapRotation(lastRawHeading, currentHeading); 
    } else {
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
        
        if (Date.now() - lastCompassEventTimestamp > SENSOR_TIMEOUT_MS && lastCompassEventTimestamp !== 0) {
            console.warn(`[WARN-HB] no compass events ${SENSOR_TIMEOUT_MS/1000}s`);
        }
    }, HEARTBEAT_INTERVAL_MS);
}

