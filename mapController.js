// mapController.js

// --- 調整可能パラメータ ---
const ROTATION_OFFSET = 0;              // マーカー画像の向き補正 (0 or 180)

// --- 状態変数 ---
let lastAppliedSelector = '';
let lastDrawnMarkerAngle = null; // 補間用に最終描画角度を保持

/**
 * 角度を-180度から+180度の範囲に正規化する
 * @param {number} deg - 角度
 * @returns {number} 正規化された角度
 */
function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
}

// DOM適用のためのセレクタ優先順位
const MARKER_ROTATOR_SELECTORS = [
    '#userMarker .user-location-marker-rotator',
    '.leaflet-marker-icon.user-marker .user-location-marker-rotator'
];

/**
 * マーカーの回転用DOM要素を取得する
 * @returns {HTMLElement|null} 回転させる要素
 */
function getMarkerRotatorElement() {
    for (const selector of MARKER_ROTATOR_SELECTORS) {
        const el = document.querySelector(selector);
        if (el) {
            lastAppliedSelector = selector;
            return el;
        }
    }
    lastAppliedSelector = 'not found';
    return null;
}

// --- 地図操作 ---

function stabilizeAfterFullScreen() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen-active', isFullscreen);
    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        icon.classList.toggle('fa-expand', !isFullscreen);
        icon.classList.toggle('fa-compress', isFullscreen);
    }
    
    map.invalidateSize({ animate: false });
    if (currentPosition && appState.followUser) {
        recenterAbsolutely(currentPosition.coords);
    }
    
    setTimeout(() => {
        map.invalidateSize({ animate: false });
        if (currentPosition && appState.followUser) {
            recenterAbsolutely(currentPosition.coords);
        }
        updateMapRotation(lastRawHeading, currentHeading);
    }, 200);
}

function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;
    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false, noMoveStart: true });
}

function onPositionUpdate(position) {
    updateUserMarkerOnly(position.coords);
    updateAllInfoPanels(position);
    if (appState.followUser) {
        recenterAbsolutely(position.coords);
    }
}

function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    if (on && currentPosition) {
        recenterAbsolutely(currentPosition.coords);
    }
}

function toggleHeadingUp(on) {
    appState.headingUp = on;
    updateOrientationButtonState();
    lastDrawnMarkerAngle = null;
    updateMapRotation(lastRawHeading, currentHeading);
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

/**
 * マーカーの回転を更新する
 * @param {number|null} rawHeading - センサーから取得した生の向き (磁北基準)
 * @param {number|null} currentHeading - 平滑化・真北補正された向き
 */
function updateMapRotation(rawHeading, currentHeading) {
    const rotator = getMarkerRotatorElement();
    if (!rotator) return;

    let targetAngle = 0;
    let relativeAngle = 0;

    // ★★★ 修正: HeadingUpモードの時だけ相対角度を計算し、それ以外は0にする ★★★
    if (appState.headingUp && typeof currentHeading === 'number' && typeof rawHeading === 'number') {
        // HeadingUp mode
        relativeAngle = normalizeDeg(currentHeading - rawHeading);
        targetAngle = relativeAngle;
    } else {
        // North-up mode
        relativeAngle = 0;
        targetAngle = 0;
    }
    
    const finalAngle = targetAngle + ROTATION_OFFSET;
    const transformValue = `rotate(${finalAngle.toFixed(1)}deg)`;

    // DOM適用
    rotator.style.transform = transformValue;
    lastDrawnMarkerAngle = finalAngle; // 描画した角度を保存

    const log = {
        mode: appState.headingUp ? 'HeadingUp' : 'NorthUp',
        raw: rawHeading,
        current: currentHeading,
        relative: relativeAngle,
        target: targetAngle,
        last: lastDrawnMarkerAngle,
        selector: lastAppliedSelector,
        hbTicks: heartbeatTicks,
    };
    
    // ★★★ 修正: [DEBUG-RM2] ログの拡充 ★★★
    console.log(`[DEBUG-RM2] mode=${log.mode} relative=${log.relative?.toFixed(1)}° target=${log.target?.toFixed(1)}°`);
    
    updateDebugPanel(log);
}

// --- UI更新ヘルパー ---
function updateUserMarkerOnly(latlng) {
    if (!currentUserMarker || !latlng) return;
    currentUserMarker.setLatLng([latlng.latitude, latlng.longitude]);
}

function updateAllInfoPanels(position) {
    const { latitude, longitude, accuracy } = position.coords;
    
    dom.currentLat.textContent = latitude.toFixed(7);
    dom.currentLon.textContent = longitude.toFixed(7);
    dom.currentAcc.textContent = accuracy.toFixed(1);
    
    if (dom.gpsStatus.textContent.includes("測位中")) {
        dom.gpsStatus.textContent = "GPS受信中";
        dom.gpsStatus.className = 'bg-green-100 text-green-800 px-2 py-1 rounded-full font-mono text-xs';
    }
    
    dom.fullscreenLat.textContent = latitude.toFixed(7);
    dom.fullscreenLon.textContent = longitude.toFixed(7);
    dom.fullscreenAcc.textContent = accuracy.toFixed(1);
    
    updateGnssStatus(accuracy);
    updateCurrentXYDisplay();

    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }
}

