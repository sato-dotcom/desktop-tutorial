// gps.js

function startGeolocation() {
    if (!navigator.geolocation) {
        dom.gpsStatus.textContent = "ブラウザが非対応です";
        dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
        return;
    }
    watchId = navigator.geolocation.watchPosition(handlePositionSuccess, handlePositionError, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
}

function startCompass() {
    const addListeners = () => {
        // iOS13+ で推奨される絶対方位（磁北基準）
        // ★★★ 変更点: 'deviceorientationabsolute' を優先し、なければ 'deviceorientation' を使う ★★★
        if ('DeviceOrientationEvent' in window) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                // iOS 13+
                DeviceOrientationEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            window.addEventListener('deviceorientation', onCompassUpdate, true);
                        }
                    }).catch(console.error);
            } else {
                // Android やその他のブラウザ
                window.addEventListener('deviceorientationabsolute', onCompassUpdate, true);
                window.addEventListener('deviceorientation', onCompassUpdate, true);
            }
        }
    };
    
    // ユーザーによる初回アクション（クリックなど）をトリガーに許可を求める
    document.body.addEventListener('click', addListeners, { once: true });
}


/**
 * GPS更新処理
 * 追従OFFの時はマーカーと情報表示の更新に留め、地図は絶対に動かさない。
 * 追従ONの時のみ、司令塔(updateMapView)を呼び出して地図を動かす。
 */
function handlePositionSuccess(position) {
    const isFirstTime = currentPosition === null;
    currentPosition = position;
    
    const { latitude, longitude, accuracy, heading } = position.coords;
    currentUserCourse = (heading !== null && !isNaN(heading)) ? heading : null;

    // UIパネルの表示更新
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

    if (isFirstTime) {
        map.setView([latitude, longitude], 16, { animate: false });
    }
    
    if (window.isFollowingUser) {
        updateMapView(false);
    }
}

function handlePositionError(error) {
    let msg = "測位エラー";
    if (error.code === 1) msg = "アクセス拒否";
    if (error.code === 2) msg = "測位不可";
    if (error.code === 3) msg = "タイムアウト";
    dom.gpsStatus.textContent = msg;
    dom.gpsStatus.className = 'bg-red-100 text-red-800 px-2 py-1 rounded-full font-mono text-xs';
}

