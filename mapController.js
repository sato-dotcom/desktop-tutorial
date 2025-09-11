// mapController.js

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

    // 描画が安定するのを待ってから中央揃えを実行
    requestAnimationFrame(() => {
        map.invalidateSize({ animate: false });
        if (currentPosition && appState.followUser) {
            console.log("--- 🎯 Recenter map after fullscreen change ---");
            recenterAbsolutely(currentPosition.coords);
        }
    });
}

/**
 * 画面中央にマーカーを絶対的に配置します。
 * 全画面切替やデバイスサイズの違いによるズレを吸収します。
 * @param {object} latlng - { latitude, longitude }
 */
function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;

    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false });

    requestAnimationFrame(() => {
        if (!currentPosition) return;

        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        const containerCenter = L.point(rect.width / 2, rect.height / 2);

        const markerPoint = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude));
        
        const offset = containerCenter.subtract(markerPoint);

        if (Math.abs(offset.x) > 4 || Math.abs(offset.y) > 4) {
             console.log(`[recenter] Correction applied. DeltaX: ${offset.x.toFixed(2)}, DeltaY: ${offset.y.toFixed(2)}`);
             map.panBy(offset, { animate: false });
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

    // 修正方針 1: followUser の状態に応じて処理を分岐
    if (appState.followUser) {
        recenterAbsolutely(latlng);
    } else {
        console.log('[GPS] 追従OFF: 中央移動なし');
    }
}

/**
 * 追従モードのON/OFFを切り替える関数
 * @param {boolean} on - trueならON、falseならOFF
 */
function toggleFollowUser(on) {
    appState.followUser = on;
    // 修正方針 3: ログ出力
    console.log(`[toggle] followUser=${on}`);
    updateFollowButtonState(); // UIの見た目を更新

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
    // 修正方針 3: ログ出力
    console.log(`[toggle] headingUp=${on}`);
    updateOrientationButtonState();
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
 * マーカーアイコンの回転を制御します。
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon || !currentPosition) return;

    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    let markerRotation = 0;

    if (appState.headingUp) {
        const effectiveHeading = (currentUserCourse !== null) ? currentUserCourse : currentHeading;
        markerRotation = effectiveHeading;
    }
    
    rotator.style.transform = `rotate(${markerRotation}deg)`; 
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
    
    // 通常パネル
    dom.currentLat.textContent = latitude.toFixed(7);
    dom.currentLon.textContent = longitude.toFixed(7);
    dom.currentAcc.textContent = accuracy.toFixed(1);
    dom.gpsStatus.textContent = "GPS受信中";
    dom.gpsStatus.className = 'bg-green-100 text-green-800 px-2 py-1 rounded-full font-mono text-xs';
    
    // 全画面パネル
    dom.fullscreenLat.textContent = latitude.toFixed(7);
    dom.fullscreenLon.textContent = longitude.toFixed(7);
    dom.fullscreenAcc.textContent = accuracy.toFixed(1);
    
    updateGnssStatus(accuracy);
    updateCurrentXYDisplay();

    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }
}
