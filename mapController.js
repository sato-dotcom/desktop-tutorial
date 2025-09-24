// mapController.js

// ★★★ 調整可能なパラメータ ★★★
const ROTATION_LERP_FACTOR = 0.3; // 補間率 (小さいほど滑らか, 0.2-0.4推奨)
const HEADING_SPIKE_THRESHOLD = 45; // スパイク検知の閾値 (30-60°推奨)

/**
 * 角度を-180度から+180度の範囲に正規化するヘルパー関数
 * @param {number} deg - 角度
 * @returns {number} 正規化された角度
 */
function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
}

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 */
function stabilizeAfterFullScreen() {
    console.log("--- 📺 Fullscreen Change Event Triggered ---");
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen-active', isFullscreen);

    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        icon.classList.toggle('fa-expand', !isFullscreen);
        icon.classList.toggle('fa-compress', isFullscreen);
        btn.title = isFullscreen ? '通常表示に戻る' : '全画面表示';
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
        // D. イベント連携: 全画面切替後もマーカーの向きを即時反映
        updateMapRotation();
    }, 200);
}

/**
 * 画面中央にマーカーを絶対的に配置します。
 */
function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;
    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false, noMoveStart: true });

    requestAnimationFrame(() => {
        if (!currentPosition) return;
        const mapSize = map.getSize();
        const containerCenter = L.point(mapSize.x / 2, mapSize.y / 2);
        const markerPoint = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude));
        const offset = containerCenter.subtract(markerPoint);
        if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
             map.panBy(offset, { animate: false, noMoveStart: true });
        }
    });
}

/**
 * GPSの位置情報が更新されるたびに呼び出される中央処理関数。
 */
function onPositionUpdate(position) {
    currentPosition = position;
    const { latitude, longitude } = position.coords;
    currentUserCourse = (position.coords.heading !== null && !isNaN(position.coords.heading)) ? position.coords.heading : null;

    updateUserMarkerOnly({ latitude, longitude });
    updateAllInfoPanels(position);

    if (appState.followUser) {
        recenterAbsolutely({ latitude, longitude });
    }
}

/**
 * 追従モードのON/OFFを切り替える関数
 */
function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    if (on && currentPosition) {
        recenterAbsolutely(currentPosition.coords);
    }
}

/**
 * ヘディングアップモードのON/OFF切り替え
 */
function toggleHeadingUp(on) {
    appState.headingUp = on;
    // E. ログ仕様
    console.log(`[DEBUG-MODE] headingUp=${on} → immediate apply`);
    updateOrientationButtonState();
    // モード切替時に角度をリセットし、滑らかに移行させる
    lastDrawnMarkerAngle = null; 
    // D. イベント連携: モード変更を即時反映
    updateMapRotation();
}

/**
 * フルスクリーンモードへの移行・解除を要求します。
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
 * マーカーの回転処理。モードに応じて挙動を分離。
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon || currentHeading === null || isNaN(currentHeading)) {
        return; 
    }
    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    if (!rotator) return;
    
    let goalAngle;
    const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

    // A. モード挙動の分離
    if (!appState.headingUp) {
        // --- ノースアップモード ---
        // 1. マーカーは常に北を向く (0度)
        goalAngle = 0;
        lastDrawnMarkerAngle = 0; // スパイク/補間は不要なので直接設定
    } else {
        // --- ヘディングアップモード ---
        // 2. マーカーは端末の絶対方位(currentHeading)を指す
        goalAngle = currentHeading;
        
        if (lastDrawnMarkerAngle === null || isNaN(lastDrawnMarkerAngle)) {
            lastDrawnMarkerAngle = goalAngle;
        }

        // B. スパイク除去と補間 (ヘディングアップ時のみ)
        const diff = normalizeDeg(goalAngle - lastDrawnMarkerAngle);

        if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD) {
            // E. ログ仕様: スパイク検知
            console.log(`[DEBUG-SPIKE] diff=${diff.toFixed(1)}° threshold=${HEADING_SPIKE_THRESHOLD}° → hold lastAngle=${lastDrawnMarkerAngle.toFixed(1)}°`);
            // スパイクを無視し、前回の角度を維持する
        } else {
            // LERP (線形補間) で滑らかに更新
            lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * ROTATION_LERP_FACTOR + 360) % 360;
        }
    }
    
    // E. ログ仕様: 通常更新
    const rawForLog = (lastRawHeading !== null) ? lastRawHeading.toFixed(1) : '---';
    const currentForLog = currentHeading.toFixed(1);
    console.log(`[DEBUG-RM2] mode=${mode} raw=${rawForLog}° current=${currentForLog}° target=${goalAngle.toFixed(1)}°`);
    
    // F. 二重適用の禁止: マーカーのスタイルのみ更新
    const finalAngle = -lastDrawnMarkerAngle;
    rotator.style.transform = `rotate(${finalAngle}deg)`;
}

/**
 * 毎フレーム描画を行うメインループです。
 */
function renderLoop() {
    // C. 初期化改善: センサーイベントを主軸とするため、ここでの呼び出しは削除
    //    代わりにgps.jsから直接呼び出される
    // updateMapRotation(); // 削除
    requestAnimationFrame(renderLoop);
}

// --- UI更新のヘルパー関数群 ---
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

