// mapController.js

// 回転アニメーション用の状態変数
const ROTATION_LERP_FACTOR = 0.3; // 補間率 (小さいほど滑らか)

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
    
    // モード切替時に角度をリセットして急な回転を防ぐ
    lastDrawnMarkerAngle = null; 
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
    if (!rotator) return;
    
    const heading = currentHeading ?? 0;
    let targetAngle;

    // ★★★ 修正方針 3: 処理位置の整理 (マーカー回転専用) ★★★
    if (!appState.headingUp) {
        // ノースアップモード：マーカーは端末の絶対方位（真北基準）を表示
        targetAngle = heading;
    } else {
        // ヘディングアップモード：マーカーは相対角度を表示 (仕様通り)
        // ここでの'raw'はコンパスの生値（磁北基準）を指す
        const raw = lastRawHeading ?? heading;
        let relative = raw - heading;
        if (relative > 180) relative -= 360;
        if (relative < -180) relative += 360;
        targetAngle = relative;
    }

    if (lastDrawnMarkerAngle === null || isNaN(lastDrawnMarkerAngle)) {
        lastDrawnMarkerAngle = targetAngle;
    }

    // LERP (線形補間) で滑らかな回転を実装
    let diff = targetAngle - lastDrawnMarkerAngle;
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;

    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + (diff * ROTATION_LERP_FACTOR) + 360) % 360;

    // ★★★ 修正方針 4: デバッグログ強化 ★★★
    const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';
    const rawForLog = (lastRawHeading !== null) ? lastRawHeading.toFixed(1) : '---';
    const currentForLog = (currentHeading !== null) ? currentHeading.toFixed(1) : '---';
    const targetForLog = (targetAngle !== null) ? targetAngle.toFixed(1) : '---';
    console.log(`[DEBUG-RM2] mode=${mode} raw=${rawForLog} current=${currentForLog} target=${targetForLog}`);

    const finalAngle = -lastDrawnMarkerAngle;
    rotator.style.transform = `rotate(${finalAngle}deg)`;
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
