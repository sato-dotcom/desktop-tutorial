// mapController.js

// --- 調整可能パラメータ ---
const ROTATION_LERP_FACTOR = 0.3; // 角度補間係数（小さいほど滑らか）
const HEADING_SPIKE_THRESHOLD = 45; // スパイクと見なす角度変化の閾値
const MAX_CONSECUTIVE_SKIPS = 3; // スパイクを連続で無視する最大回数

// --- 内部状態変数 ---
let consecutiveSpikes = 0;
let lastKnownSelector = '-';

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

// --- DOM適用 ---

// DOM適用のためのセレクタ優先順位
const MARKER_SELECTORS = [
    '#userMarker .user-location-marker-rotator',
    '.leaflet-marker-icon.user-marker .user-location-marker-rotator',
    '.leaflet-pane .leaflet-marker-icon[data-role="user"] .user-location-marker-rotator'
];

/**
 * マーカーの回転用DOM要素を取得する
 * @returns {HTMLElement|null}
 */
function getMarkerRotatorElement() {
    for (const selector of MARKER_SELECTORS) {
        const el = document.querySelector(selector);
        if (el) {
            lastKnownSelector = selector;
            return el;
        }
    }
    console.error(`[ERROR-DOM] markerEl not found (tried: ${MARKER_SELECTORS.join(', ')})`);
    lastKnownSelector = 'not found';
    return null;
}

// --- 地図操作 ---

/**
 * フルスクリーン状態が変更されたときに地図表示を安定させる
 */
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
        console.log('[DEBUG-DOM] rebind markerEl');
        console.log('[DEBUG-FS] fullscreen toggled → apply');
        updateMapRotation(lastRawHeading, currentHeading);
    }, 200);
}

/**
 * 指定した緯度経度が画面中央に来るように地図を移動する
 * @param {object} latlng - { latitude, longitude }
 */
function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;
    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false, noMoveStart: true });
    requestAnimationFrame(() => {
        if (!currentPosition) return;
        const offset = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude)).subtract(map.getSize().divideBy(2));
        if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
            map.panBy(offset.multiplyBy(-1), { animate: false, noMoveStart: true });
        }
    });
}

/**
 * GPSの位置情報更新時の処理
 * @param {GeolocationPosition} position
 */
function onPositionUpdate(position) {
    currentPosition = position;
    currentUserCourse = (position.coords.heading !== null && !isNaN(position.coords.heading)) ? position.coords.heading : null;
    updateUserMarkerOnly(position.coords);
    updateAllInfoPanels(position);
    if (appState.followUser) {
        recenterAbsolutely(position.coords);
    }
}

/**
 * 追従モードのON/OFFを切り替える
 * @param {boolean} on
 */
function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    if (on && currentPosition) {
        recenterAbsolutely(currentPosition.coords);
    }
}

/**
 * ヘディングアップモードのON/OFFを切り替える
 * @param {boolean} on
 */
function toggleHeadingUp(on) {
    appState.headingUp = on;
    console.log(`[DEBUG-MODE] headingUp=${on} → immediate apply`);
    updateOrientationButtonState();
    lastDrawnMarkerAngle = null;
    updateMapRotation(lastRawHeading, currentHeading);
}

/**
 * フルスクリーンモードを切り替える
 */
function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}


/**
 * メインのマーカー回転処理
 * @param {number|null} rawHeading - センサーから取得した生のコンパス値
 * @param {number|null} currentHeading - 補正後のコンパス値（真北基準）
 */
function updateMapRotation(rawHeading, currentHeading) {
    try {
        let relativeAngle = null;
        let diff = null;

        if (rawHeading === null || isNaN(rawHeading) || currentHeading === null || isNaN(currentHeading)) {
            console.warn(`[WARN-HEADING] raw=${rawHeading}, current=${currentHeading} → fallback target=0`);
            applyMarkerRotation(0);
            return;
        }

        let targetAngle;
        const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

        if (!appState.headingUp) {
            targetAngle = 0;
            lastDrawnMarkerAngle = 0;
            consecutiveSpikes = 0;
        } else {
            relativeAngle = normalizeDeg(rawHeading - currentHeading);
            targetAngle = relativeAngle;
            
            if (lastDrawnMarkerAngle === null) {
                lastDrawnMarkerAngle = targetAngle;
            }
            
            diff = normalizeDeg(targetAngle - lastDrawnMarkerAngle);

            if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD && consecutiveSpikes < MAX_CONSECUTIVE_SKIPS) {
                consecutiveSpikes++;
                console.log(`[DEBUG-SPIKE] diff=${diff.toFixed(1)}° threshold=${HEADING_SPIKE_THRESHOLD}° → hold last=${lastDrawnMarkerAngle.toFixed(1)}° (consecutive=${consecutiveSpikes})`);
                targetAngle = lastDrawnMarkerAngle;
            } else {
                 if (consecutiveSpikes >= MAX_CONSECUTIVE_SKIPS) {
                    console.warn(`[DEBUG-SPIKE] force sync after ${consecutiveSpikes} skips.`);
                    lastDrawnMarkerAngle = lastDrawnMarkerAngle + diff * 0.5;
                } else {
                    lastDrawnMarkerAngle = lastDrawnMarkerAngle + diff * ROTATION_LERP_FACTOR;
                }
                consecutiveSpikes = 0;
            }
        }
        
        console.log(`[DEBUG-RM2] mode=${mode} raw=${rawHeading.toFixed(1)}° current=${currentHeading.toFixed(1)}° relative=${relativeAngle?.toFixed(1) ?? '-'}° target=${targetAngle.toFixed(1)}° last=${(lastDrawnMarkerAngle||0).toFixed(1)}° diff=${diff?.toFixed(1) ?? '-'}°`);

        applyMarkerRotation(appState.headingUp ? lastDrawnMarkerAngle : 0);

        // Update debug panel (throttled)
        const now = Date.now();
        if (now - lastDebugUpdateTime > LOG_THROTTLE_MS) {
            lastDebugUpdateTime = now;
            updateDebugPanel({
                mode,
                raw: rawHeading,
                current: currentHeading,
                relative: relativeAngle,
                target: targetAngle,
                last: lastDrawnMarkerAngle,
                diff: diff,
                selector: lastKnownSelector,
                hbTicks: heartbeatTicks,
            });
        }

    } catch (err) {
        console.error('[ERROR-ROT] err=', err);
    }
}

/**
 * 実際にDOM要素に回転を適用する
 * @param {number} angle - 回転角度
 */
function applyMarkerRotation(angle) {
    const rotator = getMarkerRotatorElement();
    if (rotator) {
        console.log(`[DEBUG-DOM] markerEl found=true selector='${lastKnownSelector}'`);
        rotator.style.transform = `rotate(${-angle.toFixed(1)}deg)`;
    }
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
    
    dom.fullscreenLat.textContent = latitude.toFixed(7);
    dom.fullscreenLon.textContent = longitude.toFixed(7);
    dom.fullscreenAcc.textContent = accuracy.toFixed(1);
    
    updateGnssStatus(accuracy);
    updateCurrentXYDisplay();

    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }
}

