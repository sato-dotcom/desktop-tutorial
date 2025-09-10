// mapController.js

let lastHeading = null; // コンパスのブレを抑制するために使用

// --- デバッグログ用のスロットリング設定 ---
let lastLogTime = 0;
const LOG_INTERVAL = 1000; // ログ出力の間隔(ミリ秒)

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 */
function stabilizeAfterFullScreen() {
    console.log("--- ✅ Fullscreen Change Event Triggered ---");

    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen-active', isFullscreen);

    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        icon.className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        btn.title = isFullscreen ? '通常表示に戻る' : '全画面表示';
    }

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            console.log("--- 🚀 Running stabilization logic... ---");
            map.invalidateSize({ animate: false });
            if (currentPosition && window.isFollowingUser) {
                console.log("--- 🎯 Recenter map for following user ---");
                updateMapView(true);
            }
        });
    });
}

/**
 * ★★★ 変更点: フィルター強化、スパイク除去処理の変更 ★★★
 * コンパスの方位データが更新されたときに呼び出されます。
 */
function onCompassUpdate(event) {
    if (event.alpha === null) return;

    const rawHeading = event.webkitCompassHeading || event.alpha;
    
    // 360 -> 0 のような急な変化はフィルターに任せるため、差分チェックは削除
    
    // ★★★ フィルター強化: 指数移動平均法で値を滑らかにする ★★★
    const smoothingFactor = 0.2; // 値が小さいほど滑らかになる (0.1 - 0.5 が目安)
    let delta = rawHeading - currentHeading;
    if (delta > 180) { delta -= 360; } 
    else if (delta < -180) { delta += 360; }
    
    currentHeading += delta * smoothingFactor;
    currentHeading = (currentHeading + 360) % 360;
}

/**
 * ★★★ 変更点: 境界チェックを追加し、マーカーが画面外に飛び出すのを防ぐ ★★★
 * 地図の中心を現在地に合わせて更新します。
 */
function updateMapView(force = false) {
    if (!map || !currentPosition) return;
    if (!window.isFollowingUser && !force) return;

    const userLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);

    // ★★★ 境界チェック: マーカーが現在の地図表示範囲から外れたら強制的に中央に戻す ★★★
    if (!map.getBounds().contains(userLatLng)) {
        console.warn("--- ⚠️ Marker is out of bounds! Forcibly recentering. ---");
        map.setView(userLatLng, map.getZoom(), { animate: false });
        return; // これ以降のpanBy処理は行わない
    }

    const mapSize = map.getSize();
    const anchorPoint = L.point(
        mapSize.x / 2,
        (mapOrientationMode === 'north-up') ? (mapSize.y / 2) : (mapSize.y * 0.75)
    );
    const currentMarkerPoint = map.latLngToContainerPoint(userLatLng);
    const offset = anchorPoint.subtract(currentMarkerPoint);

    if (force) {
        map.panBy(offset, { animate: false });
    } else {
        if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
            map.panBy(offset, { animate: true, duration: 0.3, easeLinearity: 0.5 });
        }
    }
}

/**
 * 現在地マーカーの位置のみを更新します。
 */
function updateUserMarkerOnly(position) {
    if (!currentUserMarker || !position) return;
    const latlng = [position.coords.latitude, position.coords.longitude];
    currentUserMarker.setLatLng(latlng);
}

/**
 * ★★★ 変更点: ノースアップ時のマーカー回転を停止 ★★★
 * 地図とマーカーの回転を制御します。
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon || !currentPosition) return;

    const mapPane = map.getPane('mapPane');
    const northArrow = document.getElementById('north-arrow-svg');
    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    
    const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;
    let mapRotationValue = 0;
    let markerRotation = 0;

    if (mapOrientationMode === 'north-up') {
        mapRotationValue = 0;
        markerRotation = 0; // ★★★ 要望: ノースアップ時はマーカーを静止
        mapPane.style.transformOrigin = `50% 50%`;
    } else { // course-up
        mapRotationValue = window.isFollowingUser ? -effectiveHeading : 0;
        markerRotation = effectiveHeading; // ヘディングアップ時はマーカーも端末の向きに
        const markerPos = map.latLngToContainerPoint(currentUserMarker.getLatLng());
        mapPane.style.transformOrigin = `${markerPos.x}px ${markerPos.y}px`;
    }
    
    mapPane.style.transform = `rotate(${mapRotationValue}deg)`;
    rotator.style.transform = `rotate(${markerRotation}deg)`; 
    northArrow.style.transform = `rotate(${-mapRotationValue}deg)`;
}

/**
 * ★★★ 変更点: デバッグログ出力機能を追加 ★★★
 * 毎フレーム描画を行うメインループです。
 */
function renderLoop() {
    updateMapRotation();
    debugLog(); // デバッグログ出力
    requestAnimationFrame(renderLoop);
}

/**
 * ★★★ 変更点: ログ出力追加 ★★★
 * 地図の表示モード（ノースアップ/ヘディングアップ）を切り替えます。
 */
function toggleOrientationMode() {
    mapOrientationMode = (mapOrientationMode === 'north-up') ? 'course-up' : 'north-up';
    console.log(`--- 🔄 Orientation mode changed to: ${mapOrientationMode} ---`);

    const btn = document.getElementById('orientation-toggle-btn');
    const icon = btn.querySelector('i');
    if (mapOrientationMode === 'course-up') {
        icon.className = 'fas fa-location-arrow';
        btn.title = '進行方向を上に固定中 (北固定に切替)';
    } else {
        icon.className = 'fas fa-compass';
        btn.title = '北を上に固定中 (進行方向固定に切替)';
    }
    // モード切替時に地図の中心点を即時更新
    if (window.isFollowingUser) {
        updateMapView(true);
    }
}

/**
 * ★★★ 変更点: ログ出力追加 ★★★
 * 現在地への追従モードをON/OFFします。
 */
function toggleFollowUser() {
    window.isFollowingUser = !window.isFollowingUser;
    console.log(`--- 👣 Follow mode changed to: ${window.isFollowingUser} ---`);
    updateFollowButtonState();

    if (window.isFollowingUser && currentPosition) {
        updateMapView(true); // 追従再開時に即座に中央へ
    } else {
        map.stop(); // 追従解除時にアニメーション停止
    }
}

/**
 * 追従ボタンの見た目を更新します。
 */
function updateFollowButtonState() {
    if(!dom.followUserBtn) return;
    dom.followUserBtn.classList.toggle('following', window.isFollowingUser);
    dom.followUserBtn.classList.toggle('not-following', !window.isFollowingUser);
    dom.followUserBtn.title = window.isFollowingUser ? '現在地に追従中 (クリックで解除)' : '現在地への追従を再開';
}

/**
 * フルスクリーンモードへの移行・解除を要求します。
 */
function toggleFullscreen() {
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

/**
 * ★★★ 新規追加: 定期デバッグログ出力機能 ★★★
 */
function debugLog() {
    const now = Date.now();
    if (now - lastLogTime < LOG_INTERVAL) return;
    lastLogTime = now;

    if (!map || !currentPosition || !currentUserMarker?._icon) return;

    const mapPane = map.getPane('mapPane');
    const markerLatLng = currentUserMarker.getLatLng();
    const mapCenterLatLng = map.getCenter();

    console.log(`--- 🐞 DEBUG [${new Date().toLocaleTimeString()}] ---
    Marker: ${markerLatLng.lat.toFixed(5)}, ${markerLatLng.lng.toFixed(5)}
    Map Center: ${mapCenterLatLng.lat.toFixed(5)}, ${mapCenterLatLng.lng.toFixed(5)}
    Origin: ${mapPane.style.transformOrigin} | Rotation: ${mapPane.style.transform}
    Mode: ${mapOrientationMode} | Follow: ${window.isFollowingUser} | Heading: ${currentHeading.toFixed(1)}`);
}

