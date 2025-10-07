/**
 * mapController.js
 * state.jsから渡された状態に基づき、地図やマーカーの表示を更新する。
 */

/**
 * マーカーの回転を更新する
 * @param {{value: number|null, reason: string|null}} headingState - 現在の方位情報
 */
function updateMapRotation(headingState) {
    const rotator = getMarkerRotatorElement();
    if (!rotator) return;

    // ヘディングアップモードでない、または有効な方位角がない場合は北向きに固定
    if (!appState.headingUp || headingState.value === null) {
        if (headingState.value === null) {
            logJSON('mapController.js', 'skip_rotation', {
                reason: headingState.reason,
                mode: appState.headingUp ? 'HeadingUp' : 'NorthUp'
            });
        }
        rotator.style.transform = 'rotate(0deg)';
        return;
    }

    // 有効な方位角がある場合のみ、マーカーを回転
    const finalAngle = headingState.value;
    rotator.style.transform = `rotate(${finalAngle.toFixed(1)}deg)`;

    logJSON('mapController.js', 'apply_heading', {
        angle: finalAngle,
        mode: 'HeadingUp'
    });
}


// -------------------------------------------------------------
// 以下の機能は今回のログ検証では直接使用しませんが、
// アプリ全体の動作のために残しています。
// -------------------------------------------------------------

let consecutiveSpikes = 0;
let lastAppliedSelector = '';

function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
}

const MARKER_ROTATOR_SELECTORS = [
    '#userMarker .user-location-marker-rotator',
    '.leaflet-marker-icon.user-marker .user-location-marker-rotator'
];

function getMarkerRotatorElement() {
    for (const selector of MARKER_ROTATOR_SELECTORS) {
        const el = document.querySelector(selector);
        if (el) {
            lastAppliedSelector = selector;
            return el;
        }
    }
    console.error(`[ERROR-DOM] markerEl not found (tried: ${MARKER_ROTATOR_SELECTORS.join(', ')})`);
    lastAppliedSelector = 'not found';
    return null;
}

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
        updateMapRotation(appState.heading);
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
    updateMapRotation(appState.heading);
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

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

