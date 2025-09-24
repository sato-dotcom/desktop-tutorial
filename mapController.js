// mapController.js

// 調整可能パラメータ
const ROTATION_LERP_FACTOR = 0.3; 
const HEADING_SPIKE_THRESHOLD = 45;
const MAX_CONSECUTIVE_SKIPS = 3;

// --- 状態変数 ---
let consecutiveSpikes = 0;
let lastKnownSelector = 'N/A';

function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
}

const MARKER_SELECTORS = [
    '#userMarker .user-location-marker-rotator',
    '.leaflet-marker-icon.user-marker .user-location-marker-rotator',
];

function getMarkerRotatorElement() {
    for (const selector of MARKER_SELECTORS) {
        const el = document.querySelector(selector);
        if (el) {
            if (lastKnownSelector !== selector) {
                 console.log(`[DEBUG-DOM] markerEl found=true selector=${selector}`);
            }
            lastKnownSelector = selector;
            return el;
        }
    }
    console.error(`[ERROR-DOM] markerEl not found (tried: ${MARKER_SELECTORS.join(', ')})`);
    lastKnownSelector = 'Not Found';
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
        console.log('[DEBUG-DOM] rebind markerEl after fullscreen');
        console.log('[DEBUG-FS] fullscreen toggled → apply');
        if (typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
            updateMapRotation(lastRawHeading, currentHeading);
        }
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
    if (typeof lastRawHeading === 'number' && typeof currentHeading === 'number') {
        updateMapRotation(lastRawHeading, currentHeading);
    }
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
        const rotator = getMarkerRotatorElement();
        let targetAngle;
        let relativeAngle = null;
        let diff = 0;
        const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

        if (rawHeading === null || isNaN(rawHeading) || currentHeading === null || isNaN(currentHeading)) {
            console.warn(`[WARN-HEADING] raw=${rawHeading}, current=${currentHeading} → fallback target=0`);
            if(rotator) rotator.style.transform = `rotate(0deg)`;
            return;
        }

        if (!appState.headingUp) {
            targetAngle = 0;
            lastDrawnMarkerAngle = 0;
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
                // lastDrawnMarkerAngle is not updated, effectively holding it
            } else {
                 if (consecutiveSpikes >= MAX_CONSECUTIVE_SKIPS) {
                    console.warn(`[DEBUG-SPIKE] force sync after ${consecutiveSpikes} skips.`);
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * 0.5);
                } else {
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * ROTATION_LERP_FACTOR);
                }
                consecutiveSpikes = 0;
            }
        }
        
        const finalAngle = appState.headingUp ? -lastDrawnMarkerAngle : 0;
        
        const debugInfo = {
            mode: mode,
            raw: rawHeading,
            current: currentHeading,
            relative: relativeAngle,
            target: targetAngle,
            last: lastDrawnMarkerAngle,
            diff: diff,
            selector: lastKnownSelector,
            hbTicks: heartbeatTicks,
        };
        console.log(`[DEBUG-RM2] mode=${debugInfo.mode} raw=${debugInfo.raw.toFixed(1)}° current=${debugInfo.current.toFixed(1)}° relative=${debugInfo.relative?.toFixed(1)??'-'}° target=${debugInfo.target.toFixed(1)}° last=${(debugInfo.last||0).toFixed(1)}° diff=${(debugInfo.diff||0).toFixed(1)}°`);
        updateDebugPanel(debugInfo);

        if(rotator) rotator.style.transform = `rotate(${finalAngle}deg)`;

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

