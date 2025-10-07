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
    
    // UIパネルの情報もすべて更新
    updateAllInfoPanels(position);

    // 追従モードがONなら地図の中心を現在地に移動
    if (appState.followUser) {
        recenterAbsolutely(position.coords);
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

    // --- 方位情報がない場合は、すべての回転をリセットして終了 ---
    if (newHeading === null) {
        mapPane.style.transform = '';
        rotator.style.transform = 'rotate(0deg)';
        lastDrawnMarkerAngle = 0;
        logJSON('mapController.js', 'reset_rotation', {
            reason: headingState.reason,
            mode: appState.mode
        });
        return;
    }

    // --- Heading-Up モードの処理 ---
    if (appState.mode === 'heading-up') {
        const mapRotation = -newHeading;
        const markerRotation = newHeading; // マーカーは地図の回転を打ち消して常に上を向く

        // stateに基づいて回転の中心点を設定
        // TODO: 'bottom-quarter' の場合、setViewの中心もオフセットさせるとより自然になる
        let origin = '50% 50%';
        if (appState.markerAnchor === 'bottom-quarter') {
            origin = '50% 75%';
        }
        mapPane.style.transformOrigin = origin;

        // 地図とマーカーに回転を適用
        mapPane.style.transform = `rotate(${mapRotation.toFixed(1)}deg)`;
        rotator.style.transform = `rotate(${markerRotation.toFixed(1)}deg)`;
        
        // ログ出力
        logJSON('mapController.js', 'apply_heading', {
            mode: appState.mode,
            heading: newHeading.toFixed(1),
            map_rotation: mapRotation.toFixed(1),
            marker_rotation: markerRotation.toFixed(1),
            markerAnchor: appState.markerAnchor
        });

    // --- North-Up モードの処理 ---
    } else {
        // 地図の回転はリセット
        mapPane.style.transform = '';
        mapPane.style.transformOrigin = '50% 50%';
        
        // マーカーのみを滑らかに回転させる（既存ロジック）
        const currentRotation = lastDrawnMarkerAngle !== null ? lastDrawnMarkerAngle : newHeading;
        
        let diff = newHeading - (currentRotation % 360);
        if (diff > 180) {
            diff -= 360;
        } else if (diff < -180) {
            diff += 360;
        }

        const newRotation = currentRotation + diff;
        rotator.style.transform = `rotate(${newRotation.toFixed(1)}deg)`;
        lastDrawnMarkerAngle = newRotation;

        // ログ出力
        logJSON('mapController.js', 'apply_heading', {
            mode: appState.mode,
            heading: newHeading.toFixed(1),
            rotation: newRotation.toFixed(1), // 適用されたマーカーの累積角度
        });
    }
}

// -------------------------------------------------------------
// 以下の機能は今回の修正では直接変更しませんが、
// アプリ全体の動作のために残しています。
// -------------------------------------------------------------

let lastAppliedSelector = '';

function getMarkerRotatorElement() {
    // マーカーが動的に生成されるため、都度要素を取得する
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
    if (appState.position && appState.followUser) {
        recenterAbsolutely(appState.position.coords);
    }
    
    setTimeout(() => {
        map.invalidateSize({ animate: false });
        if (appState.position && appState.followUser) {
            recenterAbsolutely(appState.position.coords);
        }
        updateHeading(appState.heading);
    }, 200);
}

function recenterAbsolutely(coords) {
    if (!map || !coords) return;
    map.setView([coords.latitude, coords.longitude], map.getZoom(), { animate: false, noMoveStart: true });
}

function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    if (on && appState.position) {
        recenterAbsolutely(appState.position.coords);
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
