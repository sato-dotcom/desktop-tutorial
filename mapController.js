// mapController.js

const HEADING_FILTER_ALPHA = 0.2;
const HEADING_CHANGE_THRESHOLD = 3;

// ★★★ 4) 古い追従処理の無効化: 関連する古い関数は全て削除・置換 ★★★

/**
 * ★★★ 5) 中央補正処理 recenterAbsolutely(latlng) の実装 ★★★
 * 地図を指定された緯度経度の中央に即時移動させ、1フレーム後にピクセル単位の微調整を行う。
 * @param {L.LatLng} latlng - 中心に表示する緯度経度
 */
function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;

    map.setView(latlng, map.getZoom(), { animate: false });
    
    requestAnimationFrame(() => {
        const mapSize = map.getSize();
        const targetPoint = mapSize.divideBy(2);
        const currentPoint = map.latLngToContainerPoint(latlng);
        const offset = targetPoint.subtract(currentPoint);

        if (Math.abs(offset.x) > 4 || Math.abs(offset.y) > 4) {
            console.log(`[recenter] vertical/horizontal correction applied. Offset: x=${offset.x.toFixed(1)}, y=${offset.y.toFixed(1)}`);
            map.panBy(offset, { animate: false });
        }
    });
}

/**
 * ★★★ 1) toggleFollowUser の実装 ★★★
 * 追従モードのON/OFFを切り替える。
 * @param {boolean} on - 新しい追従状態
 */
function toggleFollowUser(on) {
    appState.followUser = on;
    console.log(`--- 👣 [Action] Follow mode toggled to: ${appState.followUser} ---`);
    updateFollowButtonState();
    
    if (appState.followUser && currentPosition) {
        const userLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
        recenterAbsolutely(userLatLng);
    } else if (!appState.followUser) {
        map.stop(); // 追従OFF時に進行中のアニメーションを停止
    }
}

/**
 * ★★★ 1) toggleHeadingUp の実装 ★★★
 * ヘディングアップモードのON/OFFを切り替える。
 * @param {boolean} on - 新しいヘディングアップ状態
 */
function toggleHeadingUp(on) {
    appState.headingUp = on;
    console.log(`--- 🔄 [Action] HeadingUp mode toggled to: ${appState.headingUp} ---`);
    updateOrientationButtonState();

    if (appState.followUser && currentPosition) {
        const userLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
        recenterAbsolutely(userLatLng);
    }
}

/**
 * ★★★ 3) onPositionUpdate の実装 ★★★
 * GPSから新しい位置情報を受け取った際のメイン処理。UI更新と追従判定を行う。
 * @param {GeolocationPosition} position - watchPositionからの位置情報オブジェクト
 */
function onPositionUpdate(position) {
    const latlng = L.latLng(position.coords.latitude, position.coords.longitude);
    const { latitude, longitude, accuracy, heading } = position.coords;

    // グローバルな位置情報を更新
    currentPosition = position;
    currentUserCourse = (heading !== null && !isNaN(heading)) ? heading : null;

    // 全てのUI要素を更新
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
    updateUserMarkerOnly(position);

    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }

    // 追従がONの場合のみ中央揃えを実行
    if (appState.followUser) {
        recenterAbsolutely(latlng);
    } else {
        console.log("[follow] OFF: center unchanged");
    }
}

function stabilizeAfterFullScreen() {
    console.log("--- ✅ Fullscreen Change Event Triggered ---");
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen-active', isFullscreen);

    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        btn.querySelector('i').className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        btn.title = isFullscreen ? '通常表示に戻る' : '全画面表示';
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            map.invalidateSize({ animate: false });
            if (currentPosition && appState.followUser) {
                const currentLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
                recenterAbsolutely(currentLatLng);
            }
        });
    });
}

function onCompassUpdate(event) {
    if (event.alpha === null) return;
    const rawHeading = event.webkitCompassHeading || event.alpha;
    let smoothedHeading = currentHeading;
    
    let delta = rawHeading - smoothedHeading;
    if (delta > 180) { delta -= 360; } 
    else if (delta < -180) { delta += 360; }

    smoothedHeading += delta * HEADING_FILTER_ALPHA;
    smoothedHeading = (smoothedHeading + 360) % 360;

    if (Math.abs(smoothedHeading - currentHeading) > HEADING_CHANGE_THRESHOLD) {
        currentHeading = smoothedHeading;
    }
}

function updateUserMarkerOnly(position) {
    if (!currentUserMarker || !position) return;
    const latlng = [position.coords.latitude, position.coords.longitude];
    currentUserMarker.setLatLng(latlng);
}

function updateMapRotation() {
    if (!currentUserMarker?._icon) return;
    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    let markerRotation = 0;
    
    if (appState.headingUp) {
        const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;
        markerRotation = effectiveHeading;
    }
    
    rotator.style.transform = `rotate(${markerRotation}deg)`; 
}

function renderLoop() {
    updateMapRotation();
    requestAnimationFrame(renderLoop);
}

function updateFollowButtonState() {
    if(!dom.followUserBtn) return;
    dom.followUserBtn.classList.toggle('following', appState.followUser);
    dom.followUserBtn.classList.toggle('not-following', !appState.followUser);
    dom.followUserBtn.title = appState.followUser ? '現在地に追従中 (クリックで解除)' : '現在地への追従を再開';
}

function updateOrientationButtonState() {
    const btn = document.getElementById('orientation-toggle-btn');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (appState.headingUp) {
        icon.className = 'fas fa-location-arrow';
        btn.title = '進行方向をマーカーで表示中 (北固定に切替)';
    } else {
        icon.className = 'fas fa-compass';
        btn.title = '北を上に固定中 (進行方向表示に切替)';
    }
}

function toggleFullscreen() {
    // この関数のロジックは変更なし
    const isCurrentlyFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (!isCurrentlyFullscreen) {
        document.documentElement.requestFullscreen().catch(err => {
            alert(`フルスクリーンモードへの移行に失敗しました: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    setTimeout(() => {
        const isFullscreenNow = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const bodyHasClass = document.body.classList.contains('fullscreen-active');
        if (isFullscreenNow !== bodyHasClass) {
             console.log("--- ⚠️ Fallback Stabilization Triggered ---");
             stabilizeAfterFullScreen();
        }
    }, 500);
}

