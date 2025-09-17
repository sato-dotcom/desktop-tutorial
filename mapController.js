// mapController.js

// 回転アニメーション用の状態変数
let displayedHeading = 0; // 実際に表示している角度
let skipRotationOnce = 0; // スキップする残りフレーム数（0なら通常処理）
const ROTATION_LERP_FACTOR = 0.1; // 小さいほど滑らか

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
    } else {
        // console.log('[GPS] 追従OFF: 中央移動なし'); // ログが多すぎるためコメントアウト
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

        displayedHeading = targetHeading;
        currentHeading = targetHeading;
        // nullでも必ず同期
        currentUserCourse = targetHeading;

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
    let targetHeading = 0;

    if (appState.headingUp) {
        // ★★★ 修正点: 描画の目標角度を常に`currentHeading`に統一 ★★★
        // これにより、マーカーはデバッグパネルのHeading(TN)の値に向かって回転します。
        targetHeading = currentHeading;
    }

    // スキップフレーム処理
    if (skipRotationOnce > 0) {
        displayedHeading = targetHeading;
        skipRotationOnce--;
        rotator.style.transform = `rotate(${displayedHeading}deg)`;
        lastDrawnMarkerAngle = displayedHeading; // 描画角度をグローバル変数に記録
        return;
    }

    let diff = ((targetHeading - displayedHeading + 540) % 360) - 180;

    if (Math.abs(diff) > 90) {
        console.log(`[Rotation Spike] diff=${diff.toFixed(1)}° → 補間制限`);
        diff = diff > 0 ? 90 : -90;
    }

    if (Math.abs(diff) < 0.5) {
        displayedHeading = targetHeading;
    } else {
        displayedHeading += diff * ROTATION_LERP_FACTOR;
    }

    displayedHeading = (displayedHeading + 360) % 360;
    lastDrawnMarkerAngle = displayedHeading; // 描画角度をグローバル変数に記録
    rotator.style.transform = `rotate(${displayedHeading}deg)`;
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

