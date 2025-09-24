// gps.js

const DEBUG = true;
// G. 調整可能パラメータ
const HEADING_FILTER_ALPHA = 0.3;
const HEARTBEAT_INTERVAL = 1000; // ハートビート間隔 (ms)

const DECLINATION_UPDATE_DISTANCE_M = 1000;
const DECLINATION_UPDATE_INTERVAL_MS = 3 * 60 * 60 * 1000;

const JGD2011_ZONE_INFO = {
    1: { lon0: 129.5, declination: 7.0 }, 2: { lon0: 131.0, declination: 7.5 },
    3: { lon0: 132.1666667, declination: 7.5 }, 4: { lon0: 133.5, declination: 7.0 },
    5: { lon0: 134.3333333, declination: 6.8 }, 6: { lon0: 136.0, declination: 6.5 },
    7: { lon0: 137.1666667, declination: 6.0 }, 8: { lon0: 138.5, declination: 5.5 },
    9: { lon0: 139.8333333, declination: 5.0 }, 10: { lon0: 140.8333333, declination: 4.5 },
    11: { lon0: 140.25, declination: 7.0 }, 12: { lon0: 142.25, declination: 6.5 },
    13: { lon0: 144.25, declination: 6.0 }, 14: { lon0: 142.0, declination: 3.0 },
    15: { lon0: 127.5, declination: 6.0 }, 16: { lon0: 124.0, declination: 5.5 },
    17: { lon0: 131.0, declination: 5.0 }, 18: { lon0: 136.0833333, declination: 4.0 },
    19: { lon0: 154.0, declination: 2.0 }
};

let currentDeclination = 0;
let lastDeclinationUpdatePos = null;
let lastDeclinationUpdateAt = 0;
let lastCurrentHeading = null;
let compassInitialized = false;
let permissionLogged = {};
let lastCompassEventTimestamp = 0;


function toTrueNorth(magneticHeading, declination) {
    if (magneticHeading === null || isNaN(magneticHeading)) return null;
    return (magneticHeading + declination + 360) % 360;
}

function getDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function detectJGD2011Zone(lat, lon) {
    let minDiff = Infinity, zone = null;
    for (const [zoneNum, info] of Object.entries(JGD2011_ZONE_INFO)) {
        const diff = Math.abs(lon - info.lon0);
        if (diff < minDiff) { minDiff = diff; zone = parseInt(zoneNum, 10); }
    }
    return zone;
}

async function updateDeclinationIfNeeded(lat, lon) {
    if (!shouldUpdateDeclination(lat, lon)) return;
    try {
        const res = await fetch(`https://vldb.gsi.go.jp/sokuchi/geomag/api/declination?lat=${lat}&lon=${lon}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (typeof data.declination !== 'number') throw new Error("Invalid API response");
        currentDeclination = data.declination;
    } catch (err) {
        const zone = detectJGD2011Zone(lat, lon);
        currentDeclination = JGD2011_ZONE_INFO[zone]?.declination ?? 0;
        console.error(`磁偏角API失敗。系${zone}の代表値を使用: ${currentDeclination.toFixed(2)}°`, err);
    }
    lastDeclinationUpdatePos = { lat, lon };
    lastDeclinationUpdateAt = Date.now();
}

function shouldUpdateDeclination(lat, lon) {
    const now = Date.now();
    if (!lastDeclinationUpdatePos || now - lastDeclinationUpdateAt > DECLINATION_UPDATE_INTERVAL_MS) return true;
    return getDistanceMeters(lastDeclinationUpdatePos.lat, lastDeclinationUpdatePos.lon, lat, lon) > DECLINATION_UPDATE_DISTANCE_M;
}

// A. イベント配線の復活
function startSensors() {
    // --- GPS ---
    if (!navigator.geolocation) {
        if (!permissionLogged.gps) console.warn('[PERM] Geolocation not supported');
        permissionLogged.gps = true;
    } else {
        navigator.geolocation.watchPosition(onGpsUpdate, handlePositionError, {
            enableHighAccuracy: true, timeout: 10000, maximumAge: 0
        });
        console.log('[DEBUG-EVT] gps=listening');
    }

    // --- Compass ---
    const addCompassListeners = () => {
        const eventName = ('ondeviceorientationabsolute' in window) ? 'deviceorientationabsolute' : 'deviceorientation';
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission().then(state => {
                if (state === 'granted') {
                    window.addEventListener(eventName, onCompassUpdate, true);
                    console.log(`[DEBUG-EVT] compass=listening to ${eventName}`);
                } else {
                    if (!permissionLogged.compass) console.warn('[PERM] Compass permission denied → retry');
                    permissionLogged.compass = true;
                }
            }).catch(err => {
                if (!permissionLogged.compass) console.error('[PERM] Compass permission request error → retry', err);
                permissionLogged.compass = true;
            });
        } else {
            window.addEventListener(eventName, onCompassUpdate, true);
            console.log(`[DEBUG-EVT] compass=listening to ${eventName}`);
        }
    };
    document.body.addEventListener('click', addCompassListeners, { once: true });

    // C. ハートビートの導入
    setInterval(() => {
        if (lastCompassEventTimestamp > 0 && (Date.now() - lastCompassEventTimestamp > 10000)) {
            console.warn('[WARN-HB] no compass events 10s');
            lastCompassEventTimestamp = Date.now(); // 警告の繰り返しを防ぐ
        }
        if (compassInitialized) {
            console.log(`[DEBUG-HB] tick raw=${(lastRawHeading||0).toFixed(1)} current=${(currentHeading||0).toFixed(1)}`);
            updateMapRotation(lastRawHeading, currentHeading);
        }
    }, HEARTBEAT_INTERVAL);
}

function onGpsUpdate(position) {
    console.log(`[DEBUG-EVT] onGpsUpdate lat=${position.coords.latitude.toFixed(4)}, lon=${position.coords.longitude.toFixed(4)}`);
    updateDeclinationIfNeeded(position.coords.latitude, position.coords.longitude);
    if (typeof onPositionUpdate === 'function') {
        onPositionUpdate(position);
    }
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    if (error.code === 1 && !permissionLogged.gps) {
        console.warn('[PERM] Geolocation permission denied → retry');
        permissionLogged.gps = true;
    }
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
}

function onCompassUpdate(event) {
    lastCompassEventTimestamp = Date.now();
    let newRawHeading = null;
    if (event.webkitCompassHeading !== undefined) {
        newRawHeading = event.webkitCompassHeading;
    } else if (event.alpha !== null) {
        newRawHeading = event.absolute ? event.alpha : 360 - event.alpha;
    }

    if (newRawHeading === null || isNaN(newRawHeading)) return;
    
    lastRawHeading = newRawHeading;
    const trueHeading = toTrueNorth(lastRawHeading, currentDeclination);
    if (trueHeading === null) return;
    
    if (lastCurrentHeading === null) lastCurrentHeading = trueHeading;
    let delta = trueHeading - lastCurrentHeading;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    currentHeading = (lastCurrentHeading + delta * HEADING_FILTER_ALPHA + 360) % 360;
    lastCurrentHeading = currentHeading;
    
    console.log(`[DEBUG-EVT] onCompassUpdate raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)}`);

    // B. 初期値の強制適用
    if (!compassInitialized && typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
        compassInitialized = true;
        console.log(`[DEBUG-INIT] first raw=${lastRawHeading.toFixed(1)} current=${currentHeading.toFixed(1)} → applied`);
        updateMapRotation(lastRawHeading, currentHeading);
        updateMapRotation(lastRawHeading, currentHeading);
    }
    
    updateMapRotation(lastRawHeading, currentHeading);
}

