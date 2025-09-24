// mapController.js

// G. 調整可能パラメータ
const ROTATION_LERP_FACTOR = 0.3; 
const HEADING_SPIKE_THRESHOLD = 45;
const MAX_CONSECUTIVE_SKIPS = 3;

// --- 状態変数 ---
let consecutiveSpikes = 0;
let markerEl = null; // マーカー要素への参照を保持

function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
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
        // D. 全画面切替後にDOMを再取得
        markerEl = document.getElementById('userMarker'); 
        console.log('[DEBUG-DOM] rebind markerEl');
        
        console.log('[DEBUG-FS] fullscreen toggled → applied');
        updateMapRotation(lastRawHeading, currentHeading);
    }, 200);
}

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

function onPositionUpdate(position) {
    currentPosition = position;
    currentUserCourse = (position.coords.heading !== null && !isNaN(position.coords.heading)) ? position.coords.heading : null;
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

function updateMapRotation(rawHeading, currentHeading) {
    try {
        // D. DOM適用の健全性チェック
        if (!markerEl) {
            markerEl = document.getElementById('userMarker');
        }
        if (!markerEl) {
            console.error('[ERROR-DOM] markerEl not found → skip');
            return;
        } else {
             // console.log('[DEBUG-DOM] markerEl found=true id=#userMarker'); // 毎フレーム出すと冗長なのでコメントアウト
        }
        const rotator = markerEl.querySelector('.user-location-marker-rotator');
        if (!rotator) return;

        let targetAngle;
        const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

        if (rawHeading === null || isNaN(rawHeading) || currentHeading === null || isNaN(currentHeading)) {
            console.warn(`[WARN-HEADING] raw=${rawHeading}, current=${currentHeading} → fallback target=0`);
            rotator.style.transform = `rotate(0deg)`;
            return;
        }

        if (!appState.headingUp) {
            targetAngle = 0;
            lastDrawnMarkerAngle = 0;
        } else {
            targetAngle = normalizeDeg(rawHeading - currentHeading);
            
            if (lastDrawnMarkerAngle === null) {
                lastDrawnMarkerAngle = targetAngle;
            }
            
            const diff = normalizeDeg(targetAngle - lastDrawnMarkerAngle);

            if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD && consecutiveSpikes < MAX_CONSECUTIVE_SKIPS) {
                consecutiveSpikes++;
                console.log(`[DEBUG-SPIKE] diff=${diff.toFixed(1)}° threshold=${HEADING_SPIKE_THRESHOLD}° → hold last=${lastDrawnMarkerAngle.toFixed(1)}°`);
            } else {
                if (consecutiveSpikes >= MAX_CONSECUTIVE_SKIPS) {
                    console.warn(`[DEBUG-SPIKE] force sync after ${consecutiveSpikes} skips.`);
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * 0.5 + 360) % 360;
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
function updateUserMarkerOnly(latlng) {
    if (!currentUserMarker || !latlng) return;
    currentUserMarker.setLatLng([latlng.latitude, latlng.longitude]);
}

function updateAllInfoPanels(position) {
    const { latitude, longitude, accuracy } = position.coords;
    
    dom.currentLat.textContent = latitude.toFixed(7);
    dom.currentLon.textContent = longitude.toFixed(7);
    dom.currentAcc.textContent = accuracy.toFixed(1);
    dom.gpsStatus.textContent = "GPS受信中";
    dom.gpsStatus.className = 'bg-green-100 text-green-800 px-2 py-1 rounded-full font-mono text-xs';
    
    dom.fullscreenLat.textContent = latitude.toFixed(7);
    dom.fullscreenLon.textContent = longitude.toFixed(7);
    dom.fullscreenAcc.textContent = accuracy.toFixed(1);
    
    updateGnssStatus(accuracy);
    updateCurrentXYDisplay();

    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }
}

