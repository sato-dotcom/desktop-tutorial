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
        if ('DeviceOrientationEvent' in window && 'requestPermission' in DeviceOrientationEvent) {
             window.addEventListener('deviceorientation', onCompassUpdate, true);
        } else {
             // Android やその他のブラウザ用のイベント
             window.addEventListener('deviceorientationabsolute', onCompassUpdate, true);
             window.addEventListener('deviceorientation', onCompassUpdate, true);
        }
    };
    
    const requestPermission = () => {
        // iOS 13+ではユーザーの許可が必要
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
                .then(permissionState => {
                    if (permissionState === 'granted') {
                        addListeners();
                    }
                })
                .catch(console.error);
        } else {
            // その他のブラウザでは許可は不要
            addListeners();
        }
    };
    // ユーザーによる初回アクション（クリックなど）をトリガーに許可を求める
    document.body.addEventListener('click', requestPermission, { once: true });
}


/**
 * GPS更新処理
 * 追従OFFの時はマーカーと情報表示の更新に留め、地図は絶対に動かさない。
 * 追従ONの時のみ、司令塔(updateMapView)を呼び出して地図を動かす。
 */
function handlePositionSuccess(position) {
    const isFirstTime = currentPosition === null;
    currentPosition = position;
    
    // --- UIとマーカー更新は、追従状態に関わらず常に行う ---
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

    // マーカー位置の更新
    updateUserMarkerOnly(position);

    // ナビゲーション情報の更新
    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }

    // 初回測位時のみズーム
    if (isFirstTime) {
        map.setView([latitude, longitude], 16, { animate: false });
    }
    
    // 通常の追従処理
    if (window.isFollowingUser) {
        updateMapView(false); // スムーズな追従
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
