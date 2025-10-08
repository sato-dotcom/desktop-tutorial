/**
 * mapController.js
 * state.jsから渡された状態に基づき、地図やマーカーの表示を更新する。
 */

/**
 * 位置情報に基づいて現在地マーカーを生成・更新する
 * @param {GeolocationPosition} position - GPSから取得した位置情報
 */
function updatePosition(position) {
    const latlng = [position.coords.latitude, position.coords.longitude];

    if (currentUserMarker === null) {
        // --- 初回: マーカーを生成 ---
        const userIconHTML = `
            <div id="userMarker" class="user-marker" data-role="user">
                <div class="user-location-marker-rotator">
                    <svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
                </div>
            </div>`;
        
        const userIcon = L.divIcon({
            html: userIconHTML,
            className: 'user-location-marker',
            iconSize: [30, 30],
            iconAnchor: [15, 15]
        });
        
        currentUserMarker = L.marker(latlng, { icon: userIcon, pane: 'markerPane' }).addTo(map);
        logJSON('mapController.js', 'marker_created', { lat: latlng[0], lon: latlng[1] });
    } else {
        // --- 2回目以降: マーカー位置を更新 ---
        currentUserMarker.setLatLng(latlng);
        logJSON('mapController.js', 'marker_updated', { lat: latlng[0], lon: latlng[1] });
    }
    
    // UIパネルの情報は常に更新
    updateAllInfoPanels(position);

    // --- 【要件4】 North-Upモードで追従オフの場合は、地図を動かさずに処理を終了 ---
    if (appState.mode === 'north-up' && !appState.followUser) {
        logJSON('mapController.js', 'follow_guard_active', { reason: 'north-up' });
        return; 
    }

    // --- 地図の中心を更新 ---
    if (appState.mode === 'north-up') {
        // --- 【要件1 & 5】 North-Up時はsetViewのみで中央固定し、直後にログ出力 ---
        map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
        logJSON('mapController.js', 'recenter', {
            reason: 'north-up-follow',
            markerAnchor: 'center'
        });

        map.once('moveend', () => {
            // 【要件4】 予約済みコールバックのガード（追従オフへの変更を検知）
            if (appState.mode !== 'north-up' || !appState.followUser) return;
            
            // --- 【要件5】 moveendでは確認ログのみを出力し、再中心化は行わない ---
            logJSON('mapController.js', 'center_check', {
                data: { center: map.getCenter(), zoom: map.getZoom() }
            });
        });
    } else if (appState.mode === 'heading-up') {
        // Heading-upモードでは常に中央に強制配置し、移動完了後に回転基点を再計算
        map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
        map.once('moveend', () => updateTransformOrigin('after_setView'));
    }
}

/**
 * 方位情報に基づいてマーカーと地図の回転を更新する
 * @param {{value: number|null, reason: string|null}} headingState - 現在の方位情報
 */
function updateHeading(headingState) {
    const rotator = getMarkerRotatorElement();
    const mapPane = map.getPane('mapPane');
    if (!rotator || !mapPane) return;

    const newHeading = headingState.value;

    if (newHeading === null) {
        mapPane.style.transform = '';
        rotator.style.transform = 'rotate(0deg)';
        lastDrawnMarkerAngle = 0;
        lastDrawnMapAngle = 0;
        lastMapHeading = null;
        logJSON('mapController.js', 'reset_rotation', {
            reason: headingState.reason,
            mode: appState.mode
        });
        return;
    }

    if (appState.mode === 'heading-up') {
        updateTransformOrigin('heading_update');
        const currentMapHeading = lastMapHeading !== null ? lastMapHeading : newHeading;
        let mapDiff = newHeading - currentMapHeading;
        if (mapDiff > 180) mapDiff -= 360;
        else if (mapDiff < -180) mapDiff += 360;
        
        const newMapRotation = (lastDrawnMapAngle !== null ? lastDrawnMapAngle : 0) - mapDiff;
        lastDrawnMapAngle = newMapRotation;
        lastMapHeading = newHeading;
        
        const currentMarkerRotation = lastDrawnMarkerAngle !== null ? lastDrawnMarkerAngle : newHeading;
        let markerDiff = newHeading - (currentMarkerRotation % 360);
        if (markerDiff > 180) markerDiff -= 360;
        else if (markerDiff < -180) markerDiff += 360;
        const newMarkerRotation = currentMarkerRotation + markerDiff;
        lastDrawnMarkerAngle = newMarkerRotation;

        mapPane.style.transform = `rotate(${newMapRotation.toFixed(1)}deg)`;
        rotator.style.transform = `rotate(${newMarkerRotation.toFixed(1)}deg)`;
        
        logJSON('mapController.js', 'apply_heading', {
            mode: appState.mode,
            heading: newHeading.toFixed(1),
            map_rotation: newMapRotation.toFixed(1),
            marker_rotation: newMarkerRotation.toFixed(1),
            markerAnchor: appState.markerAnchor
        });

    } else {
        // --- 【要件2】 North-Up時は地図の回転とオフセットを完全にリセット ---
        mapPane.style.transform = '';
        mapPane.style.transformOrigin = '50% 50%';
        lastDrawnMapAngle = null;
        lastMapHeading = null;
        
        const currentRotation = lastDrawnMarkerAngle !== null ? lastDrawnMarkerAngle : newHeading;
        
        let diff = newHeading - (currentRotation % 360);
        if (diff > 180) diff -= 360;
        else if (diff < -180) diff += 360;

        const newRotation = currentRotation + diff;
        rotator.style.transform = `rotate(${newRotation.toFixed(1)}deg)`;
        lastDrawnMarkerAngle = newRotation;

        logJSON('mapController.js', 'apply_heading', {
            mode: appState.mode,
            heading: newHeading.toFixed(1),
            rotation: newRotation.toFixed(1),
        });
    }
}

let lastAppliedSelector = '';

function getMarkerRotatorElement() {
    const selector = '#userMarker .user-location-marker-rotator';
    const el = document.querySelector(selector);
    if (!el && lastAppliedSelector !== 'not found') {
        console.error(`[ERROR-DOM] marker rotator element not found (selector: ${selector})`);
        lastAppliedSelector = 'not found';
    } else if (el) {
        lastAppliedSelector = selector;
    }
    return el;
}

function updateTransformOrigin(reason = 'unknown') {
    // --- 【要件2 & 3】 Heading-Upモード以外では実行しない ---
    if (appState.mode !== 'heading-up' || !map) return;

    const mapPane = map.getPane('mapPane');
    if (!mapPane) return;

    let originString;
    let originLog;

    if (appState.position) {
        const latlng = [appState.position.coords.latitude, appState.position.coords.longitude];
        const containerPoint = map.latLngToContainerPoint(latlng);
        
        originString = `${containerPoint.x}px ${containerPoint.y}px`;
        originLog = { x: Math.round(containerPoint.x), y: Math.round(containerPoint.y) };
    } else {
        originString = '50% 50%';
        originLog = { x: '50%', y: '50%' };
    }

    logJSON('mapController.js', 'rotation_origin_updated', {
        x: originLog.x,
        y: originLog.y,
        reason: reason,
        markerAnchor: appState.markerAnchor
    });

    if (mapPane.style.transformOrigin !== originString) {
        mapPane.style.transformOrigin = originString;
    }
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
    
    if (appState.position) {
        const coords = appState.position.coords;
        const latlng = [coords.latitude, coords.longitude];
        
        // --- 【要件3】 全画面切替後の中央固定処理（順序固定） ---
        if (appState.mode === 'north-up' && appState.followUser) {
            map.once('viewreset', () => { // invalidateSizeの完了を待つ
                // 【要件4】 予約済みコールバックのガード
                if (appState.mode !== 'north-up' || !appState.followUser) return;
                
                // --- 【要件1 & 5】 setViewで中央固定し、直後にログ出力 ---
                map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
                 logJSON('mapController.js', 'recenter', {
                    reason: 'north-up-fullscreen',
                    markerAnchor: 'center'
                });

                map.once('moveend', () => {
                    // 【要件4】 予約済みコールバックのガード
                    if (appState.mode !== 'north-up' || !appState.followUser) return;
                    // --- 【要件5】 moveendでは確認ログのみ ---
                    logJSON('mapController.js', 'center_check', {
                       data: { center: map.getCenter(), zoom: map.getZoom() }
                    });
                });
            });
        } else if (appState.mode === 'heading-up') {
            map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
            map.once('moveend', () => updateTransformOrigin('heading-up-fullscreen'));
        }
    }
}

// 【要件1】 この関数はNorth-Upモードでは使用されない
function recenterAbsolutely(coords) {
    if (!map || !coords) return;
    map.setView([coords.latitude, coords.longitude], map.getZoom(), { animate: false, noMoveStart: true });
}

function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    
    if (on && appState.position) {
        updatePosition(appState.position);
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

