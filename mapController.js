// mapController.js

// F. 調整可能パラメータ
const ROTATION_LERP_FACTOR = 0.3; // LERP α (0.2-0.4推奨)
const HEADING_SPIKE_THRESHOLD = 45; // スパイク検知の閾値 (30-60°推奨)
const MAX_CONSECUTIVE_SKIPS = 3; // 連続スキップ上限
const FAILSAFE_FRAME_THRESHOLD = 10; // フェイルセーフ発火までの無更新フレーム

// --- 状態変数 ---
let consecutiveSpikes = 0;
let noUpdateFrames = 0;


/**
 * 角度を-180度から+180度の範囲に正規化するヘルパー関数
 */
function normalizeDeg(deg) {
    let normalized = deg % 360;
    if (normalized > 180) normalized -= 360;
    if (normalized < -180) normalized += 360;
    return normalized;
}

/**
 * フルスクリーン状態の変更を検知し、UIと地図の表示を安定させます。
 */
function stabilizeAfterFullScreen() {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
    document.body.classList.toggle('fullscreen-active', isFullscreen);

    const btn = document.getElementById('fullscreen-btn');
    if (btn) {
        const icon = btn.querySelector('i');
        icon.classList.toggle('fa-expand', !isFullscreen);
        icon.classList.toggle('fa-compress', isFullscreen);
    }
    
    map.invalidateSize({ animate: false });
    if (currentPosition && appState.followUser) {
        recenterAbsolutely(currentPosition.coords);
    }
    
    setTimeout(() => {
        map.invalidateSize({ animate: false });
        if (currentPosition && appState.followUser) {
            recenterAbsolutely(currentPosition.coords);
        }
        // A. イベント配線: 全画面切替後もマーカーの向きを即時反映
        updateMapRotation();
    }, 200);
}

function recenterAbsolutely(latlng) {
    if (!map || !latlng) return;
    map.setView([latlng.latitude, latlng.longitude], map.getZoom(), { animate: false, noMoveStart: true });
    requestAnimationFrame(() => {
        if (!currentPosition) return;
        const offset = map.latLngToContainerPoint(L.latLng(latlng.latitude, latlng.longitude)).subtract(map.getSize().divideBy(2));
        if (Math.abs(offset.x) > 1 || Math.abs(offset.y) > 1) {
             map.panBy(offset.multiplyBy(-1), { animate: false, noMoveStart: true });
        }
    });
}

function onPositionUpdate(position) {
    currentPosition = position;
    currentUserCourse = (position.coords.heading !== null && !isNaN(position.coords.heading)) ? position.coords.heading : null;
    updateUserMarkerOnly(position.coords);
    updateAllInfoPanels(position);
    if (appState.followUser) {
        recenterAbsolutely(position.coords);
    }
}

function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    if (on && currentPosition) {
        recenterAbsolutely(currentPosition.coords);
    }
}

function toggleHeadingUp(on) {
    appState.headingUp = on;
    console.log(`[DEBUG-MODE] headingUp=${on} → immediate apply`);
    updateOrientationButtonState();
    lastDrawnMarkerAngle = null; 
    // A. イベント配線: モード変更を即時反映
    updateMapRotation();
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }
}

/**
 * マーカーの回転処理。モードに応じて挙動を分離。
 */
function updateMapRotation() {
    try {
        if (!currentUserMarker?._icon) return;
        const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
        if (!rotator) return;
        
        noUpdateFrames = 0; // 有効な呼び出しがあったのでカウンタをリセット

        let targetAngle;
        const mode = appState.headingUp ? 'HeadingUp' : 'NorthUp';

        // B. NaN/undefinedガードとフェイルセーフ適用
        if (currentHeading === null || isNaN(currentHeading) || lastRawHeading === null || isNaN(lastRawHeading)) {
            console.warn(`[WARN-HEADING] raw=${lastRawHeading}, current=${currentHeading} → fallback target=0`);
            targetAngle = 0;
        } else {
            // C. モード挙動の厳密分離
            if (!appState.headingUp) {
                // --- ノースアップモード ---
                targetAngle = 0;
                lastDrawnMarkerAngle = 0;
            } else {
                // --- ヘディングアップモード ---
                // B. 初期フレームは絶対に捨てない
                if (lastDrawnMarkerAngle === null) {
                    lastDrawnMarkerAngle = currentHeading;
                }
                targetAngle = currentHeading;
                const diff = normalizeDeg(targetAngle - lastDrawnMarkerAngle);

                // B. スパイク除去（連続スキップ制限付き）
                if (Math.abs(diff) > HEADING_SPIKE_THRESHOLD && consecutiveSpikes < MAX_CONSECUTIVE_SKIPS) {
                    consecutiveSpikes++;
                    console.log(`[DEBUG-SPIKE] diff=${diff.toFixed(1)}° threshold=${HEADING_SPIKE_THRESHOLD}° → hold last=${lastDrawnMarkerAngle.toFixed(1)}° (skip: ${consecutiveSpikes})`);
                    // 角度は更新しない
                } else {
                    if (consecutiveSpikes >= MAX_CONSECUTIVE_SKIPS) {
                        console.warn(`[DEBUG-SPIKE] Forced sync after ${consecutiveSpikes} skips.`);
                    }
                    consecutiveSpikes = 0;
                    // 補間
                    lastDrawnMarkerAngle = (lastDrawnMarkerAngle + diff * ROTATION_LERP_FACTOR + 360) % 360;
                }
            }
        }
        
        // E. ログ仕様
        const rawForLog = (lastRawHeading !== null) ? lastRawHeading.toFixed(1) : '---';
        const currentForLog = (currentHeading !== null) ? currentHeading.toFixed(1) : '---';
        const lastForLog = (lastDrawnMarkerAngle !== null) ? lastDrawnMarkerAngle.toFixed(1) : '---';
        const diffForLog = (lastDrawnMarkerAngle !== null && targetAngle !== null) ? normalizeDeg(targetAngle - lastDrawnMarkerAngle).toFixed(1) : '---';
        
        console.log(`[DEBUG-RM2] mode=${mode} raw=${rawForLog}° current=${currentForLog}° target=${(targetAngle||0).toFixed(1)}° last=${lastForLog}° diff=${diffForLog}°`);
        
        // C. 二重適用の禁止: マーカーのスタイルのみ更新
        const finalAngle = appState.headingUp ? -lastDrawnMarkerAngle : 0;
        rotator.style.transform = `rotate(${finalAngle}deg)`;

    } catch (err) {
        console.error('[ERROR-ROT] err=', err);
    }
}

function renderLoop() {
    // D. フェイルセーフカウンタ
    noUpdateFrames++;
    if(noUpdateFrames > FAILSAFE_FRAME_THRESHOLD) {
        console.warn(`[FAILSAFE] no-valid-update frames=${noUpdateFrames} → set target=0`);
        if (currentUserMarker?._icon) {
            const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');
            if(rotator) rotator.style.transform = `rotate(0deg)`;
        }
        noUpdateFrames=0; // リセットして再試行
    }
    requestAnimationFrame(renderLoop);
}

// --- UI更新ヘルパー ---
function updateUserMarkerOnly(latlng) {
    if (!currentUserMarker || !latlng) return;
    currentUserMarker.setLatLng([latlng.latitude, latlng.longitude]);
}

function updateAllInfoPanels(position) {
    const { latitude, longitude, accuracy } = position.coords;
    
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

    if (currentMode === 'navigate' && targetMarker) {
        updateNavigationInfo();
    }
}

