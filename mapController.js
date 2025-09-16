// mapController.js

// 修正方針 3: アニメーション用の状態変数を追加
let displayedHeading = 0; // 画面に実際に表示されている角度
const ROTATION_LERP_FACTOR = 0.1; // 回転のスムーズさ（小さいほど滑らか）

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
        icon.className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        btn.title = isFullscreen ? '通常表示に戻る' : '全画面表示';
    }

    // 2段階で中央補正を実行
    setTimeout(() => recenterMapWithCorrection(1), 50);
    setTimeout(() => recenterMapWithCorrection(2), 500);
}

/**
 * フルスクリーン切り替え後の地図中央補正処理
 */
function recenterMapWithCorrection(pass) {
    map.invalidateSize({ animate: false });
    if (currentPosition && appState.followUser) {
        console.log(`--- 🎯 Recenter map (pass ${pass}) ---`);
        recenterAbsolutely(currentPosition.coords);
    }
}

/**
 * 画面中央にマーカーを絶対的に配置する。
 */
function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;

    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false });

    requestAnimationFrame(() => {
        if (!currentPosition) return;
        const mapSize = map.getSize();
        const containerCenter = L.point(mapSize.x / 2, mapSize.y / 2);
        const markerPoint = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude));
        const offset = containerCenter.subtract(markerPoint);

        if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
            console.log(`[recenter] Correction applied. DeltaX: ${offset.x.toFixed(1)}, DeltaY: ${offset.y.toFixed(1)}`);
            map.panBy(offset, { animate: false });
        }
    });
}


/**
 * GPSの位置情報が更新されるたびに呼び出される中央処理関数。
 */
function onPositionUpdate(position) {
    currentPosition = position;
    const { latitude, longitude, accuracy, heading } = position.coords;
    currentUserCourse = (heading !== null && !isNaN(heading)) ? heading : null;

    const latlng = { latitude, longitude };
    updateUserMarkerOnly(latlng);
    updateAllInfoPanels(position);

    if (appState.followUser) {
        recenterAbsolutely(latlng);
    } else {
        console.log("[GPS] 追従OFF: 中央移動なし");
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
 * ヘディングアップモードのON/OFFを切り替える関数
 * @param {boolean} on - trueならON、falseならOFF
 */
function toggleHeadingUp(on) {
    appState.headingUp = on;
    console.log(`[toggle] headingUp=${on}`);
    updateOrientationButtonState();
}


/**
 * 修正方針 3: マーカーアイコンの回転を滑らかに補間する
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon) return;

    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    let targetHeading = 0; // デフォルトは北向き

    if (appState.headingUp) {
        // GPSの進行方向(course)があれば優先し、なければコンパス(currentHeading)を使う
        targetHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;
    }

    // 修正方針 2: 最短経路での回転差分を計算
    let diff = targetHeading - displayedHeading;
    if (diff > 180) { diff -= 360; }
    if (diff < -180) { diff += 360; }

    // 差がごくわずかならアニメーションを停止
    if (Math.abs(diff) < 0.5) {
        displayedHeading = targetHeading;
    } else {
        // 線形補間（Lerp）で目標角度に滑らかに近づける
        displayedHeading += diff * ROTATION_LERP_FACTOR;
    }
    displayedHeading = (displayedHeading + 360) % 360;

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

