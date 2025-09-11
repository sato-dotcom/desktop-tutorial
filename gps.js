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

/**
 * GPSの位置情報取得が成功した際のコールバック関数。
 * ★★★ 変更点: 処理の大部分を onPositionUpdate に移譲 ★★★
 */
function handlePositionSuccess(position) {
    const isFirstTime = currentPosition === null;
 
    // ★★★ 3) 位置更新処理を onPositionUpdate に委譲 ★★★
    onPositionUpdate(position);
 
    // 初回測位時のみズーム（これは一度きりの処理なのでここに残す）
    if (isFirstTime) {
        const { latitude, longitude } = position.coords;
        map.setView([latitude, longitude], 16, { animate: false });
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

