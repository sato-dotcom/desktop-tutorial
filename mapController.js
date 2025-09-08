// mapController.js

let lastHeading = null; // コンパスのブレを抑制するために使用

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 */
function stabilizeAfterFullScreen() {
    console.log("--- Fullscreen Change Event Triggered ---");

    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);

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
            console.log('Running stabilization logic...');
            console.log(`Dimensions: InnerH=${window.innerHeight}, ClientH=${document.documentElement.clientHeight}`);
            console.log('Current Position:', currentPosition ? `Lat: ${currentPosition.coords.latitude}` : 'null');
            
            map.invalidateSize({ animate: false }); // Leafletに地図サイズを再計算させる
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

    let diff = 0;
    if (lastHeading !== null) {
        diff = Math.abs(rawHeading - lastHeading);
        if (diff > 180) { // 359度 -> 1度のような境界をまたぐ場合を考慮
            diff = 360 - diff;
        }
        // スパイク防止：前回から10度未満の変化は無視
        if (diff < 10) {
            return;
        }
    }
    
    console.log(`Compass updated. Raw: ${rawHeading.toFixed(1)}, Last: ${lastHeading ? lastHeading.toFixed(1) : 'null'}, Diff: ${diff.toFixed(1)}`);
    lastHeading = rawHeading;

    // 方位をスムーズに更新するための処理 (前回の値に近づける)
    const smoothingFactor = 0.5;
    let delta = rawHeading - currentHeading;
    if (delta > 180) { delta -= 360; } 
    else if (delta < -180) { delta += 360; }
    currentHeading += delta * smoothingFactor;
    currentHeading = (currentHeading + 360) % 360;
}

/**
 * 地図の中心を現在地に合わせて更新します。CSS Transformの影響を受けないロジックに修正。
 * @param {boolean} force - trueの場合、アニメーションなしで即座に再配置
 */
function updateMapView(force = false) {
    if (!map || !currentPosition) return;
    if (!window.isFollowingUser && !force) return;

    const userLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
    const zoom = map.getZoom();
    const mapSize = map.getSize();

    // 1. アンカー位置（ユーザーを配置したい画面上の目標地点）を決定
    const anchorPoint = L.point(
        mapSize.x / 2,
        (mapOrientationMode === 'north-up') ? (mapSize.y / 2) : (mapSize.y * 0.75)
    );

    // 2. 現在の地図の中心のピクセル座標を取得
    const centerPoint = map.project(map.getCenter(), zoom);
    
    // 3. ユーザーの地理座標をピクセル座標に変換
    const userPoint = map.project(userLatLng, zoom);

    // 4. ユーザー位置がアンカー位置に来るような、新しい中心のピクセル座標を計算
    const newCenterPoint = centerPoint.add(userPoint.subtract(centerPoint)).subtract(anchorPoint).add(L.point(mapSize.x/2, mapSize.y/2));
    
    // 5. 新しい中心のピクセル座標を地理座標に戻す
    const newCenterLatLng = map.unproject(newCenterPoint, zoom);

    if (force) {
        map.setView(newCenterLatLng, zoom, { animate: false });
        return;
    }
    
    // 通常の追従（スムーズスクロール）
    const currentCenter = map.getCenter();
    if (Math.abs(currentCenter.lat - newCenterLatLng.lat) > 0.000001 || Math.abs(currentCenter.lng - newCenterLatLng.lng) > 0.000001) {
        map.panTo(newCenterLatLng, { animate: true, duration: 0.2, easeLinearity: 0.5 });
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
 * 地図とマーカーの回転を制御します。ロジックを修正。
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon) return;

    const mapPane = map.getPane('mapPane');
    const northArrow = document.getElementById('north-arrow-svg');
    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');

    let mapRotationValue = 0;
    let markerRotation = 0;
    
    // GPSの進行方向(course)があれば優先し、なければコンパス(heading)を使う
    const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;

    if (mapOrientationMode === 'north-up') {
        // ノースアップモードでは、地図もマーカーも一切回転させない
        mapRotationValue = 0;
        markerRotation = 0; 
    } else { // course-up (ヘディングアップ/HUDモード)
        // 追従中のみ地図を回転させ、マーカーは常に上向き固定
        mapRotationValue = window.isFollowingUser ? -effectiveHeading : 0;
        markerRotation = 0;
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
 * フォールバックとして、クリック直後にも安定化処理をタイマーで呼び出します。
 */
function toggleFullscreen() {
    // フルスクリーンAPIを呼び出す
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
            alert(`フルスクリーンモードへの移行に失敗しました: ${err.message}`);
        });
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
    
    // フォールバック処理: イベントが発火しない場合に備え、0.5秒後に強制実行
    setTimeout(() => {
        const isFullscreenNow = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const bodyHasClass = document.body.classList.contains('fullscreen-active');
        // 実際の状態とUIのクラスが食い違っている場合のみ、安定化処理を強制する
        if (isFullscreenNow !== bodyHasClass) {
             console.log("--- Fallback Stabilization Triggered ---");
             stabilizeAfterFullScreen();
        }
    }, 500);
}

