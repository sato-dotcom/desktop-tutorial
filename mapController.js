// mapController.js

// 調整可能パラメータ
const ROTATION_LERP_FACTOR = 0.3; 
const HEADING_SPIKE_THRESHOLD = 45;
const MAX_CONSECUTIVE_SKIPS = 3;

// --- 状態変数 ---
let consecutiveSpikes = 0;

function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
}

// DOM適用のためのセレクタ優先順位
const MARKER_SELECTORS = [
    '#userMarker .user-location-marker-rotator', // 第一優先（固定ID）
    '.leaflet-marker-icon.user-marker .user-location-marker-rotator', // 第二優先（Leafletアイコン）
    '.leaflet-pane .leaflet-marker-icon[data-role="user"] .user-location-marker-rotator' // 第三優先（汎用フォールバック）
];

function getMarkerRotatorElement() {
    for (const selector of MARKER_SELECTORS) {
        const el = document.querySelector(selector);
        if (el) {
            // console.log(`[DEBUG-DOM] markerEl found=true selector=${selector}`); // 毎フレームは冗長
            return el;
        }
    }
    console.error(`[ERROR-DOM] markerEl not found (tried: ${MARKER_SELECTORS.join(', ')})`);
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
        console.log('[DEBUG-DOM] rebind markerEl');
        console.log('[DEBUG-FS] fullscreen toggled → apply');
        updateMapRotation(lastRawHeading, currentHeading);
    }, 200);
}

function recenterAbsolutely(latlng) { /* ... (内容は変更なし) ... */ if (!map || !latlng) return; map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false, noMoveStart: true }); requestAnimationFrame(() => { if (!currentPosition) return; const offset = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude)).subtract(map.getSize().divideBy(2)); if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) { map.panBy(offset.multiplyBy(-1), { animate: false, noMoveStart: true }); } }); }
function onPositionUpdate(position) { /* ... (内容は変更なし) ... */ currentPosition = position; currentUserCourse = (position.coords.heading !== null && !isNaN(position.coords.heading)) ? position.coords.heading : null; updateUserMarkerOnly(position.coords); updateAllInfoPanels(position); if (appState.followUser) { recenterAbsolutely(position.coords); } }
function toggleFollowUser(on) { /* ... (内容は変更なし) ... */ appState.followUser = on; updateFollowButtonState(); if (on && currentPosition) { recenterAbsolutely(currentPosition.coords); } }


function toggleHeadingUp(on) {
    appState.headingUp = on;
    console.log(`[DEBUG-MODE] headingUp=${on} → immediate apply`);
    updateOrientationButtonState();
    lastDrawnMarkerAngle = null; 
    updateMapRotation(lastRawHeading, currentHeading);
}

function toggleFullscreen() { /* ... (内容は変更なし) ... */ if (!document.fullscreenElement && !document.webkitFullscreenElement) { document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`)); } else { if (document.exitFullscreen) document.exitFullscreen(); else if (document.webkitExitFullscreen) document.webkitExitFullscreen(); } }

function updateMapRotation(rawHeading, currentHeading) {
    try {
        const rotator = getMarkerRotatorElement();
        if (!rotator) return; // エラーはgetMarkerRotatorElement内で出力

        let targetAngle;
        const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

        if (rawHeading === null || isNaN(rawHeading) || currentHeading === null || isNaN(currentHeading)) {
            console.warn(`[WARN-HEADING] raw=${rawHeading}, current=${currentHeading} → fallback target=0`);
            rotator.style.transform = `rotate(0deg)`;
            return;
        }

        if (!appState.headingUp) {
            targetAngle = 0;
            lastDrawnMarkerAngle = 0; // ノースアップ時は常に0にリセット
        } else {
            targetAngle = normalizeDeg(rawHeading - currentHeading);
            
            if (lastDrawnMarkerAngle === null) {
                lastDrawnMarkerAngle = targetAngle; // 初回は補間なし
            }
            
            const diff = normalizeDeg(targetAngle - lastDrawnMarkerAngle);

            if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD && consecutiveSpikes < MAX_CONSECUTIVE_SKIPS) {
                consecutiveSpikes++;
                console.log(`[DEBUG-SPIKE] diff=${diff.toFixed(1)}° threshold=${HEADING_SPIKE_THRESHOLD}° → hold last=${lastDrawnMarkerAngle.toFixed(1)}°`);
                targetAngle = lastDrawnMarkerAngle; // 角度を維持
            } else {
                 if (consecutiveSpikes >= MAX_CONSECUTIVE_SKIPS) {
                    console.warn(`[DEBUG-SPIKE] force sync after ${consecutiveSpikes} skips.`);
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * 0.5 + 360) % 360; // 少し速めに追従
                } else {
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * ROTATION_LERP_FACTOR + 360) % 360;
                }
                consecutiveSpikes = 0;
            }
        }
        
        const finalAngle = appState.headingUp ? -lastDrawnMarkerAngle : 0;
        
        console.log(`[DEBUG-RM2] mode=${mode} raw=${rawHeading.toFixed(1)}° current=${currentHeading.toFixed(1)}° target=${targetAngle.toFixed(1)}° last=${(lastDrawnMarkerAngle||0).toFixed(1)}° diff=${normalizeDeg(targetAngle - (lastDrawnMarkerAngle||0)).toFixed(1)}°`);

        rotator.style.transform = `rotate(${finalAngle}deg)`;

    } catch (err) {
        console.error('[ERROR-ROT] err=', err);
    }
}

// --- UI更新ヘルパー ---
function updateUserMarkerOnly(latlng) { /* ... (内容は変更なし) ... */ if (!currentUserMarker || !latlng) return; currentUserMarker.setLatLng([latlng.latitude, latlng.longitude]); }
function updateAllInfoPanels(position) { /* ... (内容は変更なし) ... */ const { latitude, longitude, accuracy } = position.coords; dom.currentLat.textContent = latitude.toFixed(7); dom.currentLon.textContent = longitude.toFixed(7); dom.currentAcc.textContent = accuracy.toFixed(1); dom.gpsStatus.textContent = "GPS受信中"; dom.gpsStatus.className = 'bg-green-100 text-green-800 px-2 py-1 rounded-full font-mono text-xs'; dom.fullscreenLat.textContent = latitude.toFixed(7); dom.fullscreenLon.textContent = longitude.toFixed(7); dom.fullscreenAcc.textContent = accuracy.toFixed(1); updateGnssStatus(accuracy); updateCurrentXYDisplay(); if (currentMode === 'navigate' && targetMarker) { updateNavigationInfo(); } }

