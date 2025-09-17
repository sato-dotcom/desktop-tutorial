// mapController.js

// 回転アニメーション用の状態変数
let skipRotationOnce = 0; // スキップする残りフレーム数（0なら通常処理）
const ROTATION_LERP_FACTOR = 0.3; // 補間率 (小さいほど滑らか)
let lastSummaryTs = 0; // 最後のサマリログ出力タイムスタンプ

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 * 即時補正と遅延補正の二段階でズレを吸収します。
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

    // 1. 即時補正: まず描画サイズを更新し、すぐに中央へ
    map.invalidateSize({ animate: false });
    if (currentPosition && appState.followUser) {
        console.log("--- 🎯 Recenter (Immediate) after fullscreen change ---");
        recenterAbsolutely(currentPosition.coords);
    }
    
    // 2. 遅延補正: レンダリングが完全に落ち着いた後、再度中央へ
    setTimeout(() => {
        map.invalidateSize({ animate: false });
        if (currentPosition && appState.followUser) {
            console.log("--- 🎯 Recenter (Delayed) after fullscreen change ---");
            recenterAbsolutely(currentPosition.coords);
        }
    }, 200); // 200ms待機
}


/**
 * 画面中央にマーカーを絶対的に配置します。
 * getBoundingClientRectとgetSizeを比較し、動的にズレを補正します。
 * @param {object} latlng - { latitude, longitude }
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
             console.log(`[recenter] Applying correction. Offset X: ${offset.x.toFixed(1)}, Y: ${offset.y.toFixed(1)}`);
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

    const latlng = { latitude, longitude };
    updateUserMarkerOnly(latlng);
    updateAllInfoPanels(position);

    if (appState.followUser) {
        recenterAbsolutely(latlng);
    }
}

/**
 * 追従モードのON/OFFを切り替える関数
 * @param {boolean} on - trueならON、falseならOFF
 */
function toggleFollowUser(on) {
    appState.followUser = on;
    console.log(`[toggle] followUser=${on}`);
    updateFollowButtonState();

    if (on && currentPosition) {
        recenterAbsolutely(currentPosition.coords);
    }
}

/**
 * ヘディングアップモードのON/OFF切り替え
 * @param {boolean} on - trueならON、falseならOFF
 */
function toggleHeadingUp(on) {
    appState.headingUp = on;
    console.log(`[toggle] headingUp=${on}`);
    updateOrientationButtonState();

    if (on) {
        const targetHeading = (currentUserCourse !== null && !isNaN(currentUserCourse))
            ? currentUserCourse
            : currentHeading;

        // lastDrawnMarkerAngle と currentHeading を同期してジャンプを防ぐ
        lastDrawnMarkerAngle = targetHeading;
        currentHeading = targetHeading;

        console.log(`[Heading Snap] Synced all headings to ${targetHeading.toFixed(1)}°`);

        // 2フレーム分スキップ
        skipRotationOnce = 2;
    }
}


/**
 * フルスクリーンモードへの移行・解除を要求します。
 */
function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            console.error(`Fullscreen failed: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}


/**
 * マーカーの回転を滑らかに補間し、常に最短方向で回転
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon) return;

    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    let targetAngle = 0;

    if (appState.headingUp) {
        targetAngle = currentHeading; // gps.jsで計算済みの真北基準値
    }

    // 初回描画時または値が無効な場合
    if (lastDrawnMarkerAngle === null || isNaN(lastDrawnMarkerAngle)) {
        lastDrawnMarkerAngle = targetAngle;
    }

    // スキップフレーム処理
    if (skipRotationOnce > 0) {
        lastDrawnMarkerAngle = targetAngle;
        skipRotationOnce--;
    } else {
        // 最短距離での回転差分を計算
        let diff = targetAngle - lastDrawnMarkerAngle;
        if (diff > 180) diff -= 360;
        if (diff < -180) diff += 360;

        // ★★★ 修正点: ログ出力条件を緩和し、サマリログを追加 ★★★
        const absDiff = Math.abs(diff);

        // 閾値緩和＆headingUp条件撤廃
        if (absDiff > 12) { // 閾値を12°に下げる
            console.log(`[DEBUG-THRESH] diff=${diff.toFixed(1)}° target=${targetAngle.toFixed(1)}° last=${lastDrawnMarkerAngle.toFixed(1)}° raw=${lastRawHeading !== null ? lastRawHeading.toFixed(1) : '-'}° course=${currentUserCourse !== null ? currentUserCourse.toFixed(1) : '-'}`);
        } else {
            console.log(`[DEBUG] diff=${diff.toFixed(1)}° target=${targetAngle.toFixed(1)}° last=${lastDrawnMarkerAngle.toFixed(1)}°`);
        }
        
        // 5秒ごとのサマリ出力
        const now = Date.now();
        if (now - lastSummaryTs > 5000) {
            console.log(`[DEBUG-SUM] diff=${diff.toFixed(1)}° target=${targetAngle.toFixed(1)}° last=${lastDrawnMarkerAngle.toFixed(1)}° raw=${lastRawHeading !== null ? lastRawHeading.toFixed(1) : '-'}° course=${currentUserCourse !== null ? currentUserCourse.toFixed(1) : '-'}`);
            lastSummaryTs = now;
        }

        // 急な回転を抑制する
        if (Math.abs(diff) > 90) {
            console.log(`[Rotation Spike] diff=${diff.toFixed(1)}° → 補間制限`);
            diff = diff > 0 ? 90 : -90;
        }
        
        // 補間処理
        lastDrawnMarkerAngle += diff * ROTATION_LERP_FACTOR;
        lastDrawnMarkerAngle = (lastDrawnMarkerAngle + 360) % 360;
    }

    mapRotationAngle = 0; // 地図は回転しない
    rotator.style.transform = `rotate(${lastDrawnMarkerAngle}deg)`;
}


/**
 * 毎フレーム描画を行うメインループです。
 */
function renderLoop() {
    updateMapRotation();
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

