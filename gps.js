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
        if ('DeviceOrientationEvent' in window) {
            if (typeof DeviceOrientationEvent.requestPermission === 'function') {
                DeviceOrientationEvent.requestPermission()
                    .then(permissionState => {
                        if (permissionState === 'granted') {
                            window.addEventListener('deviceorientation', onCompassUpdate, true);
                        }
                    }).catch(console.error);
            } else {
                // 'deviceorientationabsolute' を優先し、なければ 'deviceorientation' を使う
                if ('ondeviceorientationabsolute' in window) {
                    window.addEventListener('deviceorientationabsolute', onCompassUpdate, true);
                } else {
                    window.addEventListener('deviceorientation', onCompassUpdate, true);
                }
            }
        }
    };
    
    document.body.addEventListener('click', addListeners, { once: true });
}

function handlePositionSuccess(position) {
    const isFirstTime = currentPosition === null;
    currentPosition = position;
    
    const { latitude, longitude, accuracy, heading } = position.coords;
    currentUserCourse = (heading !== null && !isNaN(heading)) ? heading : null;

    // UI表示更新
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
    
    // 追従モードなら地図を更新
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

