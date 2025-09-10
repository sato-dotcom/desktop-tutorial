// mapController.js

// --- ★★★ 新規追加: 方位フィルター設定 ★★★ ---
const HEADING_FILTER_ALPHA = 0.2; // ローパスフィルターの係数 (0.0 a 1.0). 小さいほど滑らか
const HEADING_CHANGE_THRESHOLD = 3; // この角度(度)以上変化した場合のみ描画更新

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 * ★★★ 変更点: setViewによる確実な再センタリング ★★★
 */
function stabilizeAfterFullScreen() {
    console.log("--- ✅ Fullscreen Change Event Triggered ---");
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen-active', isFullscreen);

    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        btn.querySelector('i').className = isFullscreen ? 'fas fa-compress' : 'fas fa-expand';
        btn.title = isFullscreen ? '通常表示に戻る' : '全画面表示';
    }

    // ★★★ 必須対応: rAF×2 → invalidateSize() → setView() の順で安定化 ★★★
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            console.log("--- 🚀 Running stabilization logic... ---");
            map.invalidateSize({ animate: false });
            if (currentPosition && window.isFollowingUser) {
                const currentLatLng = [currentPosition.coords.latitude, currentPosition.coords.longitude];
                map.setView(currentLatLng, map.getZoom(), { animate: false });
                 console.log("--- 🎯 Map recentered via setView after fullscreen change ---");
            }
        });
    });
}

/**
 * ★★★ 変更点: 新しい方位フィルターを導入 ★★★
 * コンパスの方位データが更新されたときに呼び出されます。
 */
function onCompassUpdate(event) {
    if (event.alpha === null) return;
    const rawHeading = event.webkitCompassHeading || event.alpha;

    let smoothedHeading = currentHeading;
    
    // 最短距離での角度差を計算
    let delta = rawHeading - smoothedHeading;
    if (delta > 180) { delta -= 360; } 
    else if (delta < -180) { delta += 360; }

    // ローパスフィルターを適用
    smoothedHeading += delta * HEADING_FILTER_ALPHA;
    smoothedHeading = (smoothedHeading + 360) % 360;

    // 前回の確定値からの変化が閾値を超えた場合のみ更新
    if (Math.abs(smoothedHeading - currentHeading) > HEADING_CHANGE_THRESHOLD) {
        currentHeading = smoothedHeading;
    }
}

/**
 * ★★★ 変更点: setViewのみを使用するシンプルな中央固定ロジックに変更 ★★★
 * 地図の中心を現在地に合わせて更新します。
 */
function updateMapView(force = false) {
    if (!map || !currentPosition) return;
    if (!window.isFollowingUser && !force) return;

    const userLatLng = L.latLng(currentPosition.coords.latitude, currentPosition.coords.longitude);
    
    // ★★★ 必須対応: 現在地の中央固定は map.setView() のみで行う ★★★
    map.setView(userLatLng, map.getZoom(), { animate: false });
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
 * ★★★ 変更点: 地図を回転させず、マーカーアイコンのみ回転させる ★★★
 */
function updateMapRotation() {
    if (!currentUserMarker?._icon) return;

    // ★★★ 必須対応: mapPaneへの transform を全撤去 ★★★
    const mapPane = map.getPane('mapPane');
    mapPane.style.transform = ''; // 回転をリセット
    mapPane.style.transformOrigin = ''; // 回転軸をリセット

    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
    const northArrow = document.getElementById('north-arrow-svg');
    
    let markerRotation = 0;
    
    // ★★★ 必須対応: ヘディングアップは「マーカーアイコンのみ回転」で表現 ★★★
    if (mapOrientationMode === 'course-up') {
        const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;
        markerRotation = effectiveHeading;
    }
    
    rotator.style.transform = `rotate(${markerRotation}deg)`; 
    northArrow.style.transform = ''; // 北矢印は常に北を指す(回転しない)
}


/**
 * 毎フレーム描画を行うメインループです。
 */
function renderLoop() {
    updateMapRotation();
    requestAnimationFrame(renderLoop);
}

/**
 * ★★★ 変更点: ログ出力追加 ★★★
 * 地図の表示モード（ノースアップ/ヘディングアップ）を切り替えます。
 */
function toggleOrientationMode() {
    mapOrientationMode = (mapOrientationMode === 'north-up') ? 'course-up' : 'north-up';
    // ★★★ 必須対応: トグル時ログ ★★★
    console.log(`--- 🔄 Orientation mode changed to: ${mapOrientationMode} ---`);

    const btn = document.getElementById('orientation-toggle-btn');
    const icon = btn.querySelector('i');
    if (mapOrientationMode === 'course-up') {
        icon.className = 'fas fa-location-arrow';
        btn.title = '進行方向をマーカーで表示中 (北固定に切替)';
    } else {
        icon.className = 'fas fa-compass';
        btn.title = '北を上に固定中 (進行方向表示に切替)';
    }
}

/**
 * ★★★ 変更点: ログ出力追加 ★★★
 * 現在地への追従モードをON/OFFします。
 */
function toggleFollowUser() {
    window.isFollowingUser = !window.isFollowingUser;
    // ★★★ 必須対応: トグル時ログ ★★★
    console.log(`--- 👣 Follow mode changed to: ${window.isFollowingUser} ---`);
    updateFollowButtonState();

    if (window.isFollowingUser && currentPosition) {
        updateMapView(true); 
    } else {
        map.stop();
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
    // フォールバック処理
    setTimeout(() => {
        const isFullscreenNow = !!(document.fullscreenElement || document.webkitFullscreenElement);
        const bodyHasClass = document.body.classList.contains('fullscreen-active');
        if (isFullscreenNow !== bodyHasClass) {
             console.log("--- ⚠️ Fallback Stabilization Triggered ---");
             stabilizeAfterFullScreen();
        }
    }, 500);
}

// ===== 追従モードと中央補正の追加処理 =====

// 現在の位置を保存する変数
let currentLatLng = null;

// 位置更新時の処理
function onPositionUpdate(latlng) {
  currentLatLng = latlng;
  if (userMarker) {
    userMarker.setLatLng(latlng);
  }
  // 追従モードがONのときだけ中央に移動
  if (appState.followUser) {
    recenterAbsolutely(latlng);
    console.log('[follow] setView center to user');
  } else {
    console.log('[follow] OFF: center unchanged');
  }
}

// マーカーを中央に置く処理（ズレ補正付き）
function recenterAbsolutely(latlng) {
  map.setView(latlng, map.getZoom(), { animate: false });

  // 1フレーム後にズレを測って補正
  requestAnimationFrame(() => {
    const rect = map.getContainer().getBoundingClientRect();
    const screenCenterY = rect.top + rect.height / 2;
    const point = map.latLngToContainerPoint(latlng);
    const markerY = rect.top + point.y;
    const deltaY = Math.round(markerY - screenCenterY);

    if (Math.abs(deltaY) > 4) {
      map.panBy([0, -deltaY], { animate: false });
      console.log('[recenter] vertical correction applied', deltaY);
    }
  });
}

// 追従モード切り替え
function toggleFollowUser(on) {
  appState.followUser = on;
  console.log('[toggle] followUser =', on);
  if (on && currentLatLng) {
    recenterAbsolutely(currentLatLng);
  }
}

// ヘディングアップ切り替え
function toggleHeadingUp(on) {
  appState.headingUp = on;
  console.log('[toggle] headingUp =', on);
  if (currentLatLng) {
    recenterAbsolutely(currentLatLng);
  }
}

// 現在地更新処理（GPSイベントから呼ばれる）
function onPositionUpdate(latlng) {
  currentLatLng = latlng;
  if (userMarker) {
    userMarker.setLatLng(latlng);
  }
  if (appState.followUser) {
    recenterAbsolutely(latlng);
    console.log('[follow] setView center to user');
  } else {
    console.log('[follow] OFF: center unchanged');
  }
}

// 中央補正処理
function recenterAbsolutely(latlng) {
  map.setView(latlng, map.getZoom(), { animate: false });
  requestAnimationFrame(() => {
    const rect = map.getContainer().getBoundingClientRect();
    const screenCenterY = rect.top + rect.height / 2;
    const point = map.latLngToContainerPoint(latlng);
    const markerY = rect.top + point.y;
    const deltaY = Math.round(markerY - screenCenterY);
    if (Math.abs(deltaY) > 4) {
      map.panBy([0, -deltaY], { animate: false });
      console.log('[recenter] vertical correction applied', deltaY);
    }
  });
}