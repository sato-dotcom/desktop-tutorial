// mapController.js

let lastHeading = null; // コンパスのブレを抑制するために使用

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 */
function stabilizeAfterFullScreen() {
    console.log("fullscreenchange event triggered. Stabilizing map...");

    const isFullscreen = !!document.fullscreenElement;

    // bodyのクラスを更新してUI（コントロールパネル）の表示/非表示を制御
    document.body.classList.toggle('fullscreen-active', isFullscreen);
    
    // フルスクリーンボタンのアイコンとツールチップを更新
    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        if (isFullscreen) {
            icon.classList.remove('fa-expand');
            icon.classList.add('fa-compress');
            btn.title = '通常表示に戻る';
        } else {
            icon.classList.remove('fa-compress');
            icon.classList.add('fa-expand');
            btn.title = '全画面表示';
        }
    }
    
    // requestAnimationFrameを二重に使い、ブラウザの描画が完全に落ち着くのを待つ
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            console.log('Running stabilization...');
            console.log('Window Height:', window.innerHeight, 'Client Height:', document.documentElement.clientHeight);
            console.log('Current Position:', currentPosition);
            
            map.invalidateSize(); // Leafletに地図サイズを再計算させる
            if (currentPosition && window.isFollowingUser) {
                updateMapView(true); // 追従モードなら地図を再中央化
            }
        });
    });
}

/**
 * コンパスの方位データが更新されたときに呼び出されます。
 * @param {DeviceOrientationEvent} event - デバイスの向きに関するイベント情報
 */
function onCompassUpdate(event) {
    if (event.alpha === null) return;
    
    const rawHeading = event.alpha; // alpha値がコンパス方位

    // スパイク防止：前回から10度以上の変化がない場合は処理しない
    if (lastHeading !== null) {
        let diff = Math.abs(rawHeading - lastHeading);
        if (diff > 180) { // 359度 -> 1度のような境界をまたぐ場合を考慮
            diff = 360 - diff;
        }
        if (diff < 10) {
            return;
        }
    }
    
    console.log(`onCompassUpdate called. Raw: ${rawHeading.toFixed(1)}, Last: ${lastHeading ? lastHeading.toFixed(1) : 'null'}`);
    lastHeading = rawHeading;

    // 方位をスムーズに更新するための処理
    const smoothingFactor = 0.5;
    let diff = rawHeading - currentHeading;
    if (diff > 180) { diff -= 360; } 
    else if (diff < -180) { diff += 360; }
    currentHeading += diff * smoothingFactor;
    currentHeading = (currentHeading + 360) % 360;
}

/**
 * 地図の中心を現在地に合わせて更新します。（ui.jsから移動）
 * @param {boolean} force - trueの場合、アニメーションなしで即座に再配置
 */
function updateMapView(force = false) {
    if (!map || !currentPosition) return;
    if (!window.isFollowingUser && !force) return;

    const container = map.getContainer();
    const w = container.clientWidth;
    const h = container.clientHeight;
    const targetPoint = L.point(w / 2, (mapOrientationMode === 'north-up') ? (h / 2) : (h * 0.75));
    const userLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
    const zoom = map.getZoom();

    if (force) {
        map.setView(userLatLng, zoom, { animate: false });
        const centerPoint = L.point(w / 2, h / 2);
        const offsetPx = targetPoint.subtract(centerPoint);
        if (offsetPx.x !== 0 || offsetPx.y !== 0) {
            map.panBy(offsetPx, { animate: false });
        }
        return;
    }

    const userPoint = map.latLngToContainerPoint(userLatLng);
    const newCenterPoint = userPoint.subtract(L.point(w / 2, h / 2)).add(targetPoint);
    const newCenter = map.containerPointToLatLng(newCenterPoint);

    if (window.isFollowingUser) {
        const currentCenter = map.getCenter();
        if (Math.abs(currentCenter.lat - newCenter.lat) > 0.00001 || Math.abs(currentCenter.lng - newCenter.lng) > 0.00001) {
            map.panTo(newCenter, { animate: true, duration: 0.2, easeLinearity: 0.5 });
        }
    }
}

/**
 * 現在地マーカーの位置のみを更新します。（ui.jsから移動）
 * @param {GeolocationPosition} position - GPSから取得した位置情報
 */
function updateUserMarkerOnly(position) {
    if (!currentUserMarker || !position) return;
    const latlng = [position.coords.latitude, position.coords.longitude];
    currentUserMarker.setLatLng(latlng);
}

/**
 * 地図とマーカーの回転を制御します。（map.jsから移動）
 */
function updateMapRotation() {
    if (!currentPosition || !currentUserMarker || !currentUserMarker._icon) return;

    const mapPane = map.getPane('mapPane');
    const northArrow = document.getElementById('north-arrow-svg');
    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');

    let mapRotationValue = 0;
    let markerRotation = 0;
    
    const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;

    if (mapOrientationMode === 'north-up') {
        mapRotationValue = 0;
        markerRotation = effectiveHeading;
    } else { // course-up (ヘディングアップ)
        mapRotationValue = window.isFollowingUser ? -effectiveHeading : 0;
        markerRotation = window.isFollowingUser ? 0 : effectiveHeading;
    }
    
    mapPane.style.transform = `rotate(${mapRotationValue}deg)`;
    rotator.style.transform = `rotate(${markerRotation}deg)`;
    northArrow.style.transform = `rotate(${-mapRotationValue}deg)`;
}

/**
 * 毎フレーム描画を行うメインループです。（main.jsから移動）
 */
function renderLoop() {
    updateMapRotation();
    requestAnimationFrame(renderLoop);
}

/**
 * 地図の表示モード（ノースアップ/ヘディングアップ）を切り替えます。（ui.jsから移動）
 */
function toggleOrientationMode() {
    mapOrientationMode = (mapOrientationMode === 'north-up') ? 'course-up' : 'north-up';
    const btn = document.getElementById('orientation-toggle-btn');
    const icon = btn.querySelector('i');
    if (mapOrientationMode === 'course-up') {
        icon.className = 'fas fa-location-arrow';
        btn.title = '進行方向を上に固定中 (北固定に切替)';
    } else {
        icon.className = 'fas fa-compass';
        btn.title = '北を上に固定中 (進行方向固定に切替)';
    }
    if (window.isFollowingUser) {
        updateMapView(true);
    }
}

/**
 * 現在地への追従モードをON/OFFします。（ui.jsから移動）
 */
function toggleFollowUser() {
    window.isFollowingUser = !window.isFollowingUser;
    updateFollowButtonState();
    if (window.isFollowingUser && currentPosition) {
        updateMapView(true);
    } else {
        map.stop();
    }
}

/**
 * 追従ボタンの見た目を更新します。（ui.jsから移動）
 */
function updateFollowButtonState() {
    if(!dom.followUserBtn) return;
    if (window.isFollowingUser) {
        dom.followUserBtn.classList.add('following');
        dom.followUserBtn.classList.remove('not-following');
        dom.followUserBtn.title = '現在地に追従中 (クリックで解除)';
    } else {
        dom.followUserBtn.classList.remove('following');
        dom.followUserBtn.classList.add('not-following');
        dom.followUserBtn.title = '現在地への追従を再開';
    }
}

/**
 * フルスクリーンモードへの移行・解除を要求します。
 * 実際の表示更新は 'fullscreenchange' イベントで実行されます。
 */
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            alert(`フルスクリーンモードへの移行に失敗しました: ${err.message} (${err.name})`);
        });
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}
