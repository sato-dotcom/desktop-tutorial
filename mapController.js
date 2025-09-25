// mapController.js

// --- 調整可能パラメータ ---
const ROTATION_LERP_FACTOR = 0.3;       // 回転の補間係数 (小さいほど滑らか)
const HEADING_SPIKE_THRESHOLD = 45;     // スパイクとみなす角度変化の閾値 (度)
const MAX_CONSECUTIVE_SKIPS = 3;        // スパイク除去で連続スキップする最大フレーム数

// --- 状態変数 ---
let consecutiveSpikes = 0;
let lastAppliedSelector = '';

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
    console.error(`[ERROR-DOM] markerEl not found (tried: ${MARKER_ROTATOR_SELECTORS.join(', ')})`);
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
        console.log('[DEBUG-DOM] rebind markerEl after fullscreen');
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
    console.log(`[DEBUG-MODE] headingUp=${on} → immediate apply`);
    updateOrientationButtonState();
    lastDrawnMarkerAngle = null;
    consecutiveSpikes = 0;
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
    try {
        const rotator = getMarkerRotatorElement();
        if (!rotator) return;
        
        let targetAngle, relativeAngle = null, diff = null;
        const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

        if (typeof rawHeading !== 'number' || typeof currentHeading !== 'number') {
            console.warn(`[WARN-HEADING] raw=${rawHeading}, current=${currentHeading} → fallback target=0`);
            targetAngle = 0;
            rotator.style.transform = 'rotate(0deg)';
        } else if (!appState.headingUp) {
            targetAngle = 0;
            lastDrawnMarkerAngle = 0;
        } else { // ヘディングアップモード
            relativeAngle = normalizeDeg(rawHeading - currentHeading);
            targetAngle = relativeAngle;
            
            if (lastDrawnMarkerAngle === null) {
                lastDrawnMarkerAngle = targetAngle;
            }
            
            diff = normalizeDeg(targetAngle - lastDrawnMarkerAngle);

            if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD && consecutiveSpikes < MAX_CONSECUTIVE_SKIPS) {
                consecutiveSpikes++;
                console.log(`[DEBUG-SPIKE] diff=${diff.toFixed(1)}° threshold=${HEADING_SPIKE_THRESHOLD}° → hold last=${lastDrawnMarkerAngle.toFixed(1)}° (skip ${consecutiveSpikes})`);
                // 角度は更新せず、前回の値を維持
            } else {
                 if (consecutiveSpikes >= MAX_CONSECUTIVE_SKIPS) {
                    console.warn(`[DEBUG-SPIKE] force sync after ${consecutiveSpikes} skips.`);
                    // LERP α=0.5で通常より速めに追従
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * 0.5 + 360) % 360;
                } else {
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * ROTATION_LERP_FACTOR + 360) % 360;
                }
                consecutiveSpikes = 0;
            }
        }
        
        const finalAngle = appState.headingUp ? -lastDrawnMarkerAngle : 0;
        rotator.style.transform = `rotate(${finalAngle.toFixed(1)}deg)`;

        const log = {
            mode: mode,
            raw: rawHeading,
            current: currentHeading,
            relative: relativeAngle,
            target: targetAngle,
            last: lastDrawnMarkerAngle,
            diff: diff,
            selector: lastAppliedSelector,
            hbTicks: heartbeatTicks,
        };
        updateDebugPanel(log); // ui.jsのデバッグパネル更新
        console.log(`[DEBUG-RM2] mode=${log.mode} raw=${log.raw?.toFixed(1)}° current=${log.current?.toFixed(1)}° relative=${log.relative?.toFixed(1)}° target=${log.target?.toFixed(1)}° last=${log.last?.toFixed(1)}° diff=${log.diff?.toFixed(1)}°`);

    } catch (err) {
        console.error('[ERROR-ROT] err=', err);
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
    
    // 初回測位時に「測位中...」から「GPS受信中」に変更
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

