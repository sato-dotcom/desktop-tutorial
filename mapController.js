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
        lastDrawnMapAngle = 0; // Reset map angle state
        lastMapHeading = null;   // Reset last heading state
        logJSON('mapController.js', 'reset_rotation', {
            reason: headingState.reason,
            mode: appState.mode
        });
        return;
    }

    // --- Heading-Up モードの処理 ---
    if (appState.mode === 'heading-up') {
        // [修正] ヘディングアップモードでは常にマーカーを中央に強制配置
        if (appState.position) {
            map.setView([appState.position.coords.latitude, appState.position.coords.longitude], map.getZoom(), { animate: false, noMoveStart: true });
        }
        
        // 1. 回転基準点を動的に設定
        updateTransformOrigin('heading-up-center');

        // 2. 地図の最短回転補正の計算
        const currentMapHeading = lastMapHeading !== null ? lastMapHeading : newHeading;
        let mapDiff = newHeading - currentMapHeading;
        
        if (mapDiff > 180) {
            mapDiff -= 360;
        } else if (mapDiff < -180) {
            mapDiff += 360;
        }
        
        // 地図の回転は方位と逆方向。差分を累積角度から引く。
        const newMapRotation = (lastDrawnMapAngle !== null ? lastDrawnMapAngle : 0) - mapDiff;
        
        // 地図の回転状態を更新
        lastDrawnMapAngle = newMapRotation;
        lastMapHeading = newHeading;
        
        // 3. マーカーの逆回転にも最短回転補正を適用
        const currentMarkerRotation = lastDrawnMarkerAngle !== null ? lastDrawnMarkerAngle : newHeading;
        let markerDiff = newHeading - (currentMarkerRotation % 360);
        if (markerDiff > 180) {
            markerDiff -= 360;
        } else if (markerDiff < -180) {
            markerDiff += 360;
        }
        const newMarkerRotation = currentMarkerRotation + markerDiff;
        lastDrawnMarkerAngle = newMarkerRotation;

        // 地図とマーカーに回転を適用
        mapPane.style.transform = `rotate(${newMapRotation.toFixed(1)}deg)`;
        rotator.style.transform = `rotate(${newMarkerRotation.toFixed(1)}deg)`;
        
        // 4. ログ出力の拡張
        logJSON('mapController.js', 'apply_heading', {
            mode: appState.mode,
            heading: newHeading.toFixed(1),
            map_rotation: newMapRotation.toFixed(1),
            marker_rotation: newMarkerRotation.toFixed(1),
            markerAnchor: appState.markerAnchor
        });

    // --- North-Up モードの処理 ---
    } else {
        // 地図の回転はリセット
        mapPane.style.transform = '';
        mapPane.style.transformOrigin = '50% 50%';
        // Heading-up用の状態もリセット
        lastDrawnMapAngle = null;
        lastMapHeading = null;
        
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

/**
 * 地図の回転基点を現在地マーカーの画面座標に更新する
 * @param {string} reason - 更新のトリガーとなった理由（ログ用）
 */
function updateTransformOrigin(reason = 'unknown') {
    if (appState.mode !== 'heading-up' || !map) return;

    const mapPane = map.getPane('mapPane');
    if (!mapPane) return;

    let originString;
    let originLog;

    if (appState.position) {
        const latlng = [appState.position.coords.latitude, appState.position.coords.longitude];
        const containerPoint = map.latLngToContainerPoint(latlng);
        
        // 将来的に 'bottom-quarter' の場合、ここでY座標を調整する
        // if (appState.markerAnchor === 'bottom-quarter') { ... }

        originString = `${containerPoint.x}px ${containerPoint.y}px`;
        originLog = { x: Math.round(containerPoint.x), y: Math.round(containerPoint.y) };
    } else {
        // 現在地が取得できていない場合のフォールバック
        originString = '50% 50%';
        originLog = { x: '50%', y: '50%' };
    }

    // [修正] イベント発生を確実に追跡するため、ログにmarkerAnchorを追加し、常にログを出力する
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
    
    // invalidateSizeは 'viewreset' イベントを発火させ、
    // 新しく追加したリスナーが transform-origin を更新する
    map.invalidateSize({ animate: false });
    
    // 追従モードがONの場合、地図を中央に再配置する
    // これにより 'moveend' イベントが発火し、transform-origin が再度更新される
    if (appState.position && appState.followUser) {
        recenterAbsolutely(appState.position.coords);
    }
}

function recenterAbsolutely(coords) {
    if (!map || !coords) return;
    map.setView([coords.latitude, coords.longitude], map.getZoom(), { animate: false, noMoveStart: true });
}

function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    if (on && appState.position) {
        // [修正] 追従モードON時に必ず中央配置と基点更新を実行
        recenterAbsolutely(appState.position.coords);
        updateTransformOrigin('follow_on');
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

