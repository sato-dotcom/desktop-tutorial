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
 * ★★★ 1) & 5) 全画面/PC/スマホのズレを吸収する中央補正処理 ★★★
 * 画面中央にマーカーを絶対的に配置する。
 * @param {object} latlng - { latitude, longitude }
 */
function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;

    // まずsetViewで大まかに中央へ
    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false });

    // 1フレーム待ってから、ピクセル単位のズレを補正
    requestAnimationFrame(() => {
        if (!currentPosition) return; // rAFの間にGPSが切れる可能性を考慮

        // 地図コンテナの実際の表示領域の中心点を計算
        const mapContainer = map.getContainer();
        const rect = mapContainer.getBoundingClientRect();
        const containerCenter = L.point(rect.width / 2, rect.height / 2);

        // 現在地マーカーの画面上のピクセル位置を取得
        const markerPoint = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude));
        
        // 理想の中央と現在のマーカー位置のピクセル差分を計算
        const offset = containerCenter.subtract(markerPoint);

        // 4px以上のsignificantなズレがある場合のみ補正
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
    const { latitude, longitude, accuracy, heading } = position.coords;
    currentUserCourse = (heading !== null && !isNaN(heading)) ? heading : null;

    // --- UI更新 ---
    const latlng = { latitude, longitude };
    updateUserMarkerOnly(latlng);
    updateAllInfoPanels(position);

    // --- 地図の中心移動 ---
    if (appState.followUser) {
        recenterAbsolutely(latlng);
    } else {
        // ★★★ 4) 追従OFF時のログ出力 ★★★
        console.log("[follow] OFF: center unchanged");
    }
}

/**
 * ★★★ 2) 追従モードのON/OFFを切り替える関数 ★★★
 * @param {boolean} on - trueならON、falseならOFF
 */
function toggleFollowUser(on) {
    appState.followUser = on;
    console.log(`--- 📍 Follow User Toggled: ${on ? 'ON' : 'OFF'} ---`);
    updateFollowButtonState(); // UIの見た目を更新

    // 追従をONにした瞬間に、即座に中央揃えを実行
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
    console.log(`--- 🧭 Heading Up Toggled: ${on ? 'ON' : 'OFF'} ---`);
    updateOrientationButtonState();
}

/**
 * マーカーアイコンの回転を制御します。
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon || !currentPosition) return;

    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    let markerRotation = 0;

    // ヘディングアップモードがONの時のみ、マーカーを回転させる
    if (appState.headingUp) {
        // GPSの進行方向(course)があれば優先し、なければコンパス(currentHeading)を使う
        const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;
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

// ---------------------------------
// UI更新のヘルパー関数群
// ---------------------------------

function updateUserMarkerOnly(latlng) {
    if (!currentUserMarker || !latlng) return;
    const leafletLatLng = L.latLng(latlng.latitude, latlng.longitude);
    
    // マーカーが地図の範囲外に出ていないかチェック
    const bounds = map.getBounds();
    if (!bounds.contains(leafletLatLng)) {
        console.warn("Marker is out of map bounds. Re-centering forcefully.");
        map.setView(leafletLatLng); // 強制的に中央に戻す
    }
    currentUserMarker.setLatLng(leafletLatLng);
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

