/**
 * mapController.js
 * state.jsから渡された状態に基づき、地図やマーカーの表示を更新する。
 */

let rotationCenterMarker = null; // 回転中心マーカーのインスタンスを保持

/**
 * 位置情報に基づいて現在地マーカーを生成・更新する
 * @param {GeolocationPosition} position - GPSから取得した位置情報
 * @param {GeolocationPosition | null} previousPosition - 【★追加】前回のGPS位置情報
 */
function updatePosition(position, previousPosition) { // 【★修正】引数追加
    const latlng = [position.coords.latitude, position.coords.longitude];
    const currentLatLng = L.latLng(latlng[0], latlng[1]); // 【★追加】Leaflet用の緯度経度オブジェクト

    // ---【★修正】アイコンのHTMLを共通化 ---
    const userIconHTML = `
        <div id="userMarker" class="user-marker" data-role="user">
            <div class="user-location-marker-rotator">
                <svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
            </div>
        </div>`;

    // --- 【★ 2025/11/13 修正】 iconOptions を定義 (要件2) ---
    const iconOptions = {
        html: userIconHTML,
        className: 'user-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15] // iconSizeの半分 (中央)
    };

    if (currentUserMarker === null) {
        // --- 初回: マーカーを生成 ---
        const userIcon = L.divIcon(iconOptions);
        
        currentUserMarker = L.marker(latlng, { icon: userIcon, pane: 'markerPane' }).addTo(map);
        // 【修正】現在地マーカーを最前面に表示
        currentUserMarker.setZIndexOffset(1000);

        logJSON('mapController.js', 'marker_created', { lat: latlng[0], lon: latlng[1] });

        logJSON('mapController.js', 'marker_anchor_check', {
         // --- 【★ 2025/11/13 修正】 (要件2) ---
         iconAnchor: iconOptions.iconAnchor,
         iconSize: iconOptions.iconSize,
         marker_anchor_forced_center: true,
         // --- 【★ 修正ここまで】 ---
         lat: latlng[0],
         lon: latlng[1]
        });

        // 【★追加】初回描画時は、この位置を「最後にsetViewした位置」として記録
        // ※state.jsのsetPositionでも初期化されるが、こちらでも念のため実施
        if (appState.lastSetViewLatLng === null) {
            appState.lastSetViewLatLng = currentLatLng;
            logJSON('mapController.js', 'lastSetViewLatLng_initialized_fallback', {
                lat: appState.lastSetViewLatLng.lat,
                lon: appState.lastSetViewLatLng.lng
            });
        }

    } else {
        // --- 2回目以降: マーカー位置を更新 ---
        currentUserMarker.setLatLng(latlng);

        // ---【★修正】iconAnchorが確実に適用されるよう、setIconでアイコンを再設定 ---
        currentUserMarker.setIcon(L.divIcon(iconOptions)); // 【★ 2025/11/13 修正】 (要件2)
        
        // 【修正】アイコン再設定時もZ-Indexを維持
        currentUserMarker.setZIndexOffset(1000);

        logJSON('mapController.js', 'marker_updated', { lat: latlng[0], lon: latlng[1] });

        // ★追加：更新時にも anchor を確認
        logJSON('mapController.js', 'marker_anchor_check_update', {
         // --- 【★ 2025/11/13 修正】 (要件2) ---
         iconAnchor: iconOptions.iconAnchor,
         iconSize: iconOptions.iconSize,
         marker_anchor_forced_center: true,
         // --- 【★ 修正ここまで】 ---
         lat: latlng[0],
         lon: latlng[1]
        });
    }
    
    // UIパネルの情報は常に更新
    updateAllInfoPanels(position);

    // --- 【★修正】 追従オフ時はここで処理を終了し、setView を実行しない ---
    // (要件1: 追従オフ時は setView しない)
    if (!appState.followUser) {
        logJSON('mapController.js', 'setView_skipped', {
            reason: 'followUser is false',
            mode: appState.mode
        });
        return; // これ以降の setView 処理を実行しない
    }

    // --- 【★修正】 累積移動距離方式 (要件1) ---
    // (要件2: 閾値チェック)
    if (appState.lastSetViewLatLng && previousPosition) {
        
        // 【★修正】 「前回のGPS位置」と「現在のGPS位置」の間の距離を計算
        const previousLatLng = L.latLng(previousPosition.coords.latitude, previousPosition.coords.longitude);
        const distance = currentLatLng.distanceTo(previousLatLng);
        
        // 【★修正】 距離を累積
        appState.cumulativeDistance += distance;
        
        const threshold = RECENTER_THRESHOLDS[appState.surveyMode] || 1; // 閾値を取得 (デフォルト1m)

        // 【★修正】 要件3: distance_check ログに cumulativeDistance を追加
        logJSON('mapController.js', 'distance_check', {
            from_prev: { lat: previousLatLng.lat, lon: previousLatLng.lng },
            to_current: { lat: currentLatLng.lat, lon: currentLatLng.lng },
            distance_step: distance.toFixed(2), // 今回のステップでの移動距離
            cumulativeDistance: appState.cumulativeDistance.toFixed(2), // 累積距離
            threshold: threshold,
            surveyMode: appState.surveyMode
        });

        // 【★修正】 累積距離が閾値未満なら地図を動かさない
        if (appState.cumulativeDistance < threshold) {
            // (要件4: 閾値未満のログ)
            // 【★修正】 要件3: setView_skipped ログに詳細情報を追加 (既存ログを流用)
            logJSON('mapController.js', 'setView_skipped', {
                reason: 'below threshold',
                mode: appState.mode,
                surveyMode: appState.surveyMode,
                cumulativeDistance: appState.cumulativeDistance.toFixed(2),
                threshold: threshold
            });
            return; // 閾値未満なら地図を動かさず終了
        }
        
    } else if (!previousPosition) {
        // state.js で初期化されるはずだが、万が一 null だった場合のログ
        logJSON('mapController.js', 'setView_skipped', {
            reason: 'previousPosition is null, skipping threshold check',
            mode: appState.mode,
            cumulativeDistance: appState.cumulativeDistance.toFixed(2)
        });
        // 【★修正】 閾値チェックをスキップする場合でも、最初のsetViewは実行する必要があるため
        // lastSetViewLatLng をここで更新し（初回のみ）、以降のsetView処理に進む
        if (appState.lastSetViewLatLng === null) {
            appState.lastSetViewLatLng = currentLatLng;
            logJSON('mapController.js', 'lastSetViewLatLng_updated_on_skip', {
                lat: appState.lastSetViewLatLng.lat,
                lon: appState.lastSetViewLatLng.lng
            });
        }
    }
    
    // --- 【★修正】 閾値を超えた場合 (または初回) のみ setView を実行するため、
    // lastSetViewLatLng と cumulativeDistance の更新は setView の *直後* に移動する
    
    // --- 追従モードがオン (かつ閾値を超えた) の場合のみ、地図の中心を更新 (setViewを実行) ---
    // 【★修正】 要件4: setView_called ログの出力位置を setView の直前に統一
    if (appState.mode === 'north-up') {
        // --- North-Up時はsetViewのみで中央固定し、直後にログ出力 ---
        logJSON('mapController.js', 'setView_called', {
            followUser: true,
            reason: 'updatePosition (north-up)',
            target: latlng,
            mode: appState.mode,
            // 【★修正】 要件3: ログに cumulativeDistance (リセット前のの値) を追加
            cumulativeDistance: appState.cumulativeDistance.toFixed(2)
        });
        map.setView(latlng, map.getZoom(), { animate: false });
        
        // 【★修正】 要件2: setView の直後に lastSetViewLatLng と cumulativeDistance を更新
        appState.lastSetViewLatLng = currentLatLng; 
        appState.cumulativeDistance = 0; // 累積距離をリセット
        logJSON('mapController.js', 'lastSetViewLatLng_updated_and_cumulative_reset', {
            lat: appState.lastSetViewLatLng.lat,
            lon: appState.lastSetViewLatLng.lng,
            cumulativeDistance: appState.cumulativeDistance // 0 になっていることを確認
        });
        
        logJSON('mapController.js', 'recenter', {
            reason: 'north-up-follow',
            markerAnchor: 'center'
        });
    } else if (appState.mode === 'heading-up') {
        // Heading-upモードでは常に中央に強制配置し、移動完了後に回転基点を再計算
        logJSON('mapController.js', 'setView_called', {
            followUser: true,
            reason: 'updatePosition (heading-up)',
            target: latlng,
            mode: appState.mode,
            // 【★修正】 要件3: ログに cumulativeDistance (リセット前のの値) を追加
            cumulativeDistance: appState.cumulativeDistance.toFixed(2)
        });
        map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });

        // 【★修正】 要件2: setView の直後に lastSetViewLatLng と cumulativeDistance を更新
        appState.lastSetViewLatLng = currentLatLng; 
        appState.cumulativeDistance = 0; // 累積距離をリセット
        logJSON('mapController.js', 'lastSetViewLatLng_updated_and_cumulative_reset', {
            lat: appState.lastSetViewLatLng.lat,
            lon: appState.lastSetViewLatLng.lng,
            cumulativeDistance: appState.cumulativeDistance // 0 になっていることを確認
        });

        map.once('moveend', () => updateTransformOrigin('after_setView'));
    }
}

/**
 * 方位情報に基づいてマーカーと地図の回転を更新する
 * @param {{value: number|null, reason: string|null}} headingState - 現在の方位情報
 */
function updateHeading(headingState) {
    const rotator = getMarkerRotatorElement();
    const mapPane = map.getPane('mapPane');
    if (!rotator || !mapPane) return;

    const newHeading = headingState.value;

    if (newHeading === null) {
        mapPane.style.transform = '';
        rotator.style.transform = 'rotate(0deg)';
        lastDrawnMarkerAngle = 0;
        lastDrawnMapAngle = 0;
        lastMapHeading = null;
        logJSON('mapController.js', 'reset_rotation', {
            reason: headingState.reason,
            mode: appState.mode
        });
        // 回転中心マーカーを削除
        if (rotationCenterMarker) {
            map.removeLayer(rotationCenterMarker);
            rotationCenterMarker = null;
        }
        return;
    }

    if (appState.mode === 'heading-up') {
        // --- 【★ 修正】 追従オフ時は地図の回転/基点更新をスキップ ---
        if (!appState.followUser) {
            logJSON('mapController.js', 'heading_update_skipped_transform', {
                reason: 'followUser=false (heading-up)',
                mode: appState.mode
            });
            // マーカーの向きだけは更新する (地図は回転させない)
            rotator.style.transform = `rotate(${newHeading.toFixed(1)}deg)`;
            lastDrawnMarkerAngle = newHeading;
            // 地図の回転状態はリセット
            mapPane.style.transform = '';
            lastDrawnMapAngle = 0;
            lastMapHeading = null;
            
            // 回転中心マーカーも削除
            if (rotationCenterMarker) {
                map.removeLayer(rotationCenterMarker);
                rotationCenterMarker = null;
            }
            return; // これ以上処理しない
        }
        // --- 【★ 修正ここまで】 ---
        
        // (この部分は今回の修正対象外) -> 追従ON時のみ実行される
        updateTransformOrigin('heading_update');
        const currentMapHeading = lastMapHeading !== null ? lastMapHeading : newHeading;
        let mapDiff = newHeading - currentMapHeading;
        if (mapDiff > 180) mapDiff -= 360;
        else if (mapDiff < -180) mapDiff += 360;
        
        const newMapRotation = (lastDrawnMapAngle !== null ? lastDrawnMapAngle : 0) - mapDiff;
        lastDrawnMapAngle = newMapRotation;
        lastMapHeading = newHeading;
        
        const currentMarkerRotation = lastDrawnMarkerAngle !== null ? lastDrawnMarkerAngle : newHeading;
        let markerDiff = newHeading - (currentMarkerRotation % 360);
        if (markerDiff > 180) markerDiff -= 360;
        else if (markerDiff < -180) markerDiff += 360;
        const newMarkerRotation = currentMarkerRotation + markerDiff;
        lastDrawnMarkerAngle = newMarkerRotation;

        mapPane.style.transform = `rotate(${newMapRotation.toFixed(1)}deg)`;
        rotator.style.transform = `rotate(${newMarkerRotation.toFixed(1)}deg)`;
        
        logJSON('mapController.js', 'apply_heading', {
            mode: appState.mode,
            heading: newHeading.toFixed(1),
            map_rotation: newMapRotation.toFixed(1),
            marker_rotation: newMarkerRotation.toFixed(1),
            markerAnchor: appState.markerAnchor
        });

    } else {
        // --- 【★ 2025/11/12 ご要望による修正】 ---
        // 追従オフ時は、センタリング関連の処理（DOM操作やログ出力）をすべてスキップする
        if (!appState.followUser) {
            logJSON('mapController.js', 'heading_update_skipped_centering', {
                reason: 'followUser=false (north-up)',
                mode: appState.mode
            });
            // 状態変数のリセット(F)もスキップし、即座にreturnする
            return; 
        }
        // --- 【★ 修正ここまで】 ---


        // --- 【要件2】 North-Up時は地図とマーカーのCSS transformを完全にリセット ---
        mapPane.style.transform = '';
        mapPane.style.transformOrigin = '';
        rotator.style.transform = 'rotate(0deg)';
        rotator.style.transformOrigin = ''; // マーカーの基点もリセット

        // 回転中心マーカーを削除
        if (rotationCenterMarker) {
            map.removeLayer(rotationCenterMarker);
            rotationCenterMarker = null;
        }
        
        // --- 【★2025/11/12 修正】 追従オフ時はセンタリング処理をスキップ ---
        // ※上記のガード節により、このブロックは appState.followUser が true の場合のみ実行される
            
        // --- 追従オンの場合のみ、センタリングチェックとDOM操作を実行 ---
        logJSON('mapController.js', 'north_up_transform_check', {
            mapPaneTransform: mapPane.style.transform,
            mapPaneOrigin: mapPane.style.transformOrigin,
            rotatorTransform: rotator.style.transform,
            rotatorOrigin: rotator.style.transformOrigin
        });

        // --- 【★ 2025/11/14 修正】 (要望2) ---
        // updateHeadingが呼ばれるたびに実行されていたDOMチェックを削除
        // (これらのチェックは toggleFollowUser(true) 時に実行される)
        // const markerEl_dom = ...
        // const markerEl = ...
        // --- 【★ 修正ここまで】 ---
        
        // ---【ここから修正】---
        // 【★ 2025/11/12 修正】 比較基準を map.getCenter() から appState.position (現在地) に変更 (要件2)
        if (map && currentUserMarker && appState.position) {
           // 【★ 要件3 修正】 ズレ距離を計算
           const mapCenter = map.getCenter();
           const markerPos = currentUserMarker.getLatLng();
           const targetPos = L.latLng(appState.position.coords.latitude, appState.position.coords.longitude);
           
           // map.getCenter() が返す地図の実際の中央 と appState.position (あるべき中央) とのズレ
           const discrepancy = mapCenter.distanceTo(targetPos); 
           
           logJSON('mapController.js', 'marker_vs_map_center', {
             mapCenter: { lat: mapCenter.lat, lon: mapCenter.lng },
             markerPos: { lat: markerPos.lat, lon: markerPos.lng },
             targetPos: { lat: targetPos.lat, lon: targetPos.lng },
             discrepancy_m: discrepancy.toFixed(2), // 【★ 要件3 追加】
             tolerance_m: RECENTER_TOLERANCE_M,
             isForcingRecenter: appState.isForcingRecenter // ★フラグの状態をログに
           });

           // 【★要件1 修正】 強制センタリングフラグが立っている場合は、ズレ許容閾値チェックをスキップ
           if (appState.isForcingRecenter) {
                // --- 【★ 2025/11/14 修正】 (要望1) ---
                // ゼロ誤差（0.1m未満）の場合は、強制センタリングをスキップ（フラグ解除）
                if (discrepancy < FORCED_RECENTER_TOLERANCE_M) {
                    logJSON('mapController.js', 'centering_check_skipped_forced', {
                        reason: 'forced recentering skipped, discrepancy near zero',
                        discrepancy_m: discrepancy.toFixed(2),
                        tolerance_m: FORCED_RECENTER_TOLERANCE_M
                    });
                    // ゼロ誤差の場合は強制フラグだけを下ろす
                    appState.isForcingRecenter = false; 
                } else {
                    logJSON('mapController.js', 'centering_check_forced', {
                        reason: 'forced recentering by toggleFollowUser', // ★要望通りのログ
                        discrepancy_m: discrepancy.toFixed(2)
                    });
                }
                // --- 【★ 修正ここまで】 ---
                // チェックをスキップし、センタリング処理（apply_heading_north_up_fixedログ）に進む
           
           } else if (discrepancy < RECENTER_TOLERANCE_M) { // 【★ 要件2 修正】 ズレ許容閾値のチェック
                // toggleFollowUser直後など、setViewの非同期実行中に
                // mapCenterとtargetPosが一時的にズレることがある。
                // ズレが許容範囲内の場合、この後の処理(apply_heading_north_up_fixedログ出力など)を
                // スキップし、意図しない再センタリング（のログ）を防ぐ。
                logJSON('mapController.js', 'centering_check_skipped', {
                    reason: 'discrepancy within tolerance',
                    discrepancy_m: discrepancy.toFixed(2)
                });
                
                // ★ 状態変数のリセットのみ実行して終了する
                lastDrawnMarkerAngle = 0;
                lastDrawnMapAngle = null;
                lastMapHeading = null;
                return; // この後の apply_heading... ログをスキップ
           } else {
                logJSON('mapController.js', 'centering_check_needed', {
                    reason: 'discrepancy exceeds tolerance',
                    discrepancy_m: discrepancy.toFixed(2)
                });
                // ズレが大きい。 updatePosition が再センタリングすることを期待する
           }
           
        } else if (map && currentUserMarker) {
            // appState.position がない場合 (フォールバック)
            logJSON('mapController.js', 'marker_vs_map_center', {
             mapCenter: map.getCenter(),
             markerPos: currentUserMarker.getLatLng(),
             targetPos: 'appState.position is null'
           });
        }
        // ---【ここまで修正】---
        
        // --- 【★ 2025/11/14 修正】 (要望3) ---
        logJSON('mapController.js', 'apply_heading_north_up_fixed', {
            mode: appState.mode,
            heading_value: newHeading.toFixed(1),
            heading_status: 'not applied (north-up)', // ログに状態を明記
            map_rotation: '0 (fixed)',
            marker_rotation: '0 (fixed)',
        });
        // --- 【★ 修正ここまで】 ---
        
        // 状態変数をリセット (追従のオンオフに関わらず実行)
        lastDrawnMarkerAngle = 0;
        lastDrawnMapAngle = null;
        lastMapHeading = null;
    }
}

let lastAppliedSelector = '';

function getMarkerRotatorElement() {
    const selector = '#userMarker .user-location-marker-rotator';
    const el = document.querySelector(selector);
    if (!el && lastAppliedSelector !== 'not found') {
        console.error(`[ERROR-DOM] marker rotator element not found (selector: ${selector})`);
        lastAppliedSelector = 'not found';
    } else if (el) {
        lastAppliedSelector = selector;
    }
    return el;
}

function updateTransformOrigin(reason = 'unknown') {
    // この関数はHeading-Upモード専用であり、North-Upモードでは実行されない
    if (appState.mode !== 'heading-up' || !map) return;

    const mapPane = map.getPane('mapPane');
    if (!mapPane) return;

    let originString;
    let originLog;

    if (appState.position) {
        const latlng = [appState.position.coords.latitude, appState.position.coords.longitude];
        const containerPoint = map.latLngToContainerPoint(latlng);
        
        originString = `${containerPoint.x}px ${containerPoint.y}px`;
        originLog = { x: Math.round(containerPoint.x), y: Math.round(containerPoint.y) };
    } else {
        originString = '50% 50%';
        originLog = { x: '50%', y: '50%' };
    }

    logJSON('mapController.js', 'rotation_origin_updated', {
        x: originLog.x,
        y: originLog.y,
        reason: reason,
        markerAnchor: appState.markerAnchor
    });

    if (mapPane.style.transformOrigin !== originString) {
        mapPane.style.transformOrigin = originString;
    }

    // --- 【★再修正】回転中心点マーカーの更新 ---
    // 1. mapPane の実際に適用されている transform-origin を取得
    const style = window.getComputedStyle(mapPane);
    const origin = style.transformOrigin.split(' ');
    const originX = parseFloat(origin[0]) || 0;
    const originY = parseFloat(origin[1]) || 0;

    // 2. ピクセル座標を地理座標に変換 (mapPane基準)
    const originLatLng = map.containerPointToLatLng([originX, originY]);

    if (!rotationCenterMarker) {
        // 【修正】アイコンサイズを拡大し、中央揃えにする
        const rotationCenterIcon = L.divIcon({
            className: 'rotation-center-icon',
            html: '<div style="font-size:28px; color:red; line-height: 50px; text-align: center;">+</div>',
            iconSize: [50, 50],
            iconAnchor: [25, 25] // 中央を基準に
        });

        rotationCenterMarker = L.marker(originLatLng, {
            icon: rotationCenterIcon,
            interactive: false,
            pane: 'markerPane'
        }).addTo(map);
        
        // 【修正】現在地アイコン(zIndexOffset: 1000)より背面に配置
        rotationCenterMarker.setZIndexOffset(500);
    } else {
        rotationCenterMarker.setLatLng(originLatLng);
    }

    // 【追加】回転中心座標と現在地座標を比較するログを出力
    if (appState.position) {
        logJSON('mapController.js', 'rotation_center_vs_user', {
            rotationCenter: { lat: originLatLng.lat, lon: originLatLng.lng },
            userPosition: { lat: appState.position.coords.latitude, lon: appState.position.coords.longitude }
        });
    }

    logJSON('mapController.js', 'rotation_center_icon_update', {
        transformOrigin: style.transformOrigin,
        containerPoint: { x: originX, y: originY },
        latlng: { lat: originLatLng.lat, lon: originLatLng.lng }
    });
}

/**
 * 【★ 2025/11/13 修正】
 * stabilizeAfterFullScreen
 * 全画面切替時（または復帰時）の地図安定化処理
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
    
    // 1. サイズ変更を地図に通知
    map.invalidateSize({ animate: false });
    logJSON('mapController.js', 'invalidateSize_called', {
        reason: 'stabilizeAfterFullScreen',
        isFullscreen: isFullscreen
    });

    // 2. 追従モードON かつ 現在地が取得済み の場合のみ、中央に強制移動
    if (appState.followUser && appState.position) {
        const coords = appState.position.coords;
        const latlng = [coords.latitude, coords.longitude];
        const currentLatLng = L.latLng(latlng[0], latlng[1]);

        // 3. 累積距離をリセット
        appState.lastSetViewLatLng = currentLatLng;
        appState.cumulativeDistance = 0;
        
        // 4. 強制センタリングフラグを立てる (zoomstart等との競合防止)
        appState.isForcingRecenter = true; 
        logJSON('mapController.js', 'forcing_recenter_flag_set', { 
            reason: 'stabilizeAfterFullScreen' 
        });

        // 5. panToで強制的に中央へ移動
        logJSON('mapController.js', 'panTo_called_after_fullscreen', {
            reason: 'stabilizeAfterFullScreen',
            target: latlng,
            mode: appState.mode,
            cumulativeDistance: appState.cumulativeDistance // 0
        });
        map.panTo(currentLatLng, { animate: false });

        // 6. Heading-Upモードの場合は、回転基点も更新
        if (appState.mode === 'heading-up') {
             map.once('moveend', () => updateTransformOrigin('after_stabilizeFullScreen'));
        }

        // 7. 1秒後に強制フラグを解除
        setTimeout(() => {
            appState.isForcingRecenter = false;
            logJSON('mapController.js', 'forcing_recenter_flag_unset', { 
                reason: 'timeout after stabilizeAfterFullScreen (1000ms)'
            });
        }, 1000);

    } else {
        // 追従オフ時は何もしない
         logJSON('mapController.js', 'stabilizeAfterFullScreen_skipped', { 
             reason: 'followUser is false or position is null',
             followUser: appState.followUser
         });
    }
    
    // --- 従来の viewreset/moveend 内の処理は panTo と重複するため削除 ---
}

// この関数はNorth-Upモードでは使用されない
function recenterAbsolutely(coords) {
    if (!map || !coords) return;

    // 【要件3】ここも明示的な if ブロックに変更
    if (appState.followUser) {
        const latlng = [coords.latitude, coords.longitude];
        logJSON('mapController.js', 'setView_called', {
            followUser: appState.followUser,
            reason: 'recenterAbsolutely',
            target: latlng,
            mode: appState.mode,
            cumulativeDistance: appState.cumulativeDistance.toFixed(2) + ' (recenter override)'
        });
        map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
        
        // 【★修正】recenter時も累積距離をリセット
        appState.lastSetViewLatLng = L.latLng(latlng[0], latlng[1]);
        appState.cumulativeDistance = 0;

    } else {
         logJSON('mapController.js', 'recenterAbsolutely_skipped', { reason: 'followUser is false' });
    }
}

/**
 * 【★修正】追従状態を切り替える (引数対応)
 * @param {boolean | undefined} forceState 
 * - boolean (true/false): 状態を強制的に設定 (dragstart時は false が入る)
 * - undefined: 現在の状態を反転させる (ボタンクリック時)
 * @param {string} [triggerEvent='button'] - (★追加) 呼び出し元のイベント
 */
function toggleFollowUser(forceState, triggerEvent = 'button') { // 【★ 2025/11/14 修正】 (要望4)
    // forceState が boolean であればその値を、undefined であれば現在の状態を反転させた値を使用
    const newState = (typeof forceState === 'boolean') ? forceState : !appState.followUser;

    // 既にその状態なら何もしない (dragstart で何度も false が呼ばれるのを防ぐ)
    if (newState === appState.followUser) {
        // 【★修正】 状態が変わらなくても、UIとstateの同期ズレ確認ログは出力する
        logJSON('mapController.js', 'followUser_state_sync_check', {
            reason: 'state unchanged',
            appStateFollowUser: appState.followUser,
            newState: newState,
            buttonClassList: dom.followUserBtn ? dom.followUserBtn.className : 'null'
        });
        return;
    }

    appState.followUser = newState;

    // --- 【★ 2025/11/14 修正】 (要望4) ---
    // ログイベント名を決定
    let eventName;
    if (triggerEvent === 'dragstart') {
        eventName = 'followUser_auto_off_drag';
    } else if (triggerEvent === 'zoomstart') {
        eventName = 'followUser_auto_off_zoom';
    } else if (typeof forceState === 'boolean' && forceState === false) {
        eventName = 'followUser_auto_off'; // フォールバック
    } else {
        eventName = 'followUser_toggled';
    }
    
    logJSON('mapController.js', eventName, {
        value: newState,
        trigger: triggerEvent, // ★修正
        isForcedOn: (forceState === undefined || forceState === true)
    });
    // --- 【★ 修正ここまで】 ---

    updateFollowButtonState(); // ui.js の関数を呼び出し (appState.followUser を参照)

    // --- 【★要件2, 3】 状態変更直後に、UIとstateの同期が取れているかログ出力 ---
    logJSON('mapController.js', 'followUser_state_sync_check', {
        reason: 'state changed',
        appStateFollowUser: appState.followUser,
        newState: newState,
        buttonClassList: dom.followUserBtn ? dom.followUserBtn.className : 'null'
    });
    
    // 【★修正】追従ONにした場合、現在地が取得済みなら即座に (閾値チェック付きの) updatePosition を呼ぶ
    // 【★修正】追従ONにした場合、累積距離をリセットし、現在地をsetViewの基点に設定
    if (newState && appState.position) {
        // 【★要件1】 強制センタリングフラグを立てる
        appState.isForcingRecenter = true; 
        logJSON('mapController.js', 'forcing_recenter_flag_set', { 
            reason: 'toggleFollowUser (ON)' 
        });

        const currentLatLng = L.latLng(appState.position.coords.latitude, appState.position.coords.longitude);

        // --- 【★要件2 修正】 ---
        // setView の *前* に lastSetViewLatLng を現在地に更新
        appState.lastSetViewLatLng = currentLatLng;
        
        // 【★ 2025/11/13 修正】 累積距離のリセットは panTo の後（または updatePosition）で行われるため、
        // ここでは閾値の調整は行わず、 0 にリセットする
        appState.cumulativeDistance = 0;
        
        logJSON('mapController.js', 'lastSetViewLatLng_reset_on_toggle', {
            reason: 'toggleFollowUser (ON)',
            lat: appState.lastSetViewLatLng.lat,
            lon: appState.lastSetViewLatLng.lng,
            cumulativeDistance: appState.cumulativeDistance,
            // 【★要件2 ログ追加】
            // cumulativeDistance_adjusted_after_forced: true, // 削除
            threshold: RECENTER_THRESHOLDS[appState.surveyMode] || 1
        });
        // --- 【★要件2 修正ここまで】 ---
        
        // 【★要件1 修正】 ログに全画面フラグを追加
        const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement);
        
        // --- 【★ 2025/11/13 修正】 (問題3対策) ---
        // setView や panTo の前に、現在の地図の慣性移動をすべて停止する
        map.stop();
        logJSON('mapController.js', 'map_stop_called', {
             reason: 'toggleFollowUser (ON)',
             trigger: triggerEvent
        });
        
        logJSON('mapController.js', 'setView_called', {
            followUser: true,
            reason: 'toggleFollowUser (ON) - Forced Recenter', // ★理由を明記
            target: [appState.position.coords.latitude, appState.position.coords.longitude],
            mode: appState.mode,
            cumulativeDistance: appState.cumulativeDistance, // 0
            forced_centering_screen_mode: isFullscreen // 【★要件1 追加】
        });
        
        // --- 【★ 2025/11/13 修正】 (要件1) ---
        const viewOptions = { 
            animate: false, 
            paddingTopLeft: [0, 0], 
            paddingBottomRight: [0, 0] 
        };
        map.setView(
            currentLatLng, 
            map.getZoom(), 
            viewOptions
        );

        // --- 【★ 2025/11/13 修正】 (問題1, 2対策) ---
        // setViewの直後にinvalidateSizeを呼び出し、
        // さらに panTo を強制実行して中央を確定させる
        
        map.invalidateSize();
        logJSON('mapController.js', 'invalidateSize_called_after_forced', {
            reason: 'toggleFollowUser (ON)',
            isFullscreen: isFullscreen
        });

        // 【★ 2025/11/13 修正】 誤差ゼロチェック (panTo_skipped_after_forced) を削除し、
        // 常に panTo を実行して中央を強制する
        map.panTo(currentLatLng, { animate: false });
        logJSON('mapController.js', 'panTo_called_after_forced', {
            reason: 'toggleFollowUser (ON) - Forced',
            target: [currentLatLng.lat, currentLatLng.lng]
        });
        // --- 【★ 修正ここまで】 ---


        // --- 【★要件1 追加】 DOMスタイル崩れを強制的に修正 ---
        const markerEl = document.getElementById('userMarker');
        if (markerEl) {
            markerEl.style.display = 'flex';
            markerEl.style.alignItems = 'center';
            markerEl.style.justifyContent = 'center';
            markerEl.style.width = '30px';
            markerEl.style.height = '30px';
            markerEl.style.lineHeight = '30px';
            markerEl.style.verticalAlign = 'middle';

            // rotatorにも適用
            const rotatorEl = markerEl.querySelector('.user-location-marker-rotator');
            if (rotatorEl) {
                rotatorEl.style.display = 'flex';
                rotatorEl.style.alignItems = 'center';
                rotatorEl.style.justifyContent = 'center';
                rotatorEl.style.width = '30px';
                rotatorEl.style.height = '30px';
                rotatorEl.style.lineHeight = '30px';
                rotatorEl.style.verticalAlign = 'middle';
            }

            logJSON('mapController.js', 'force_marker_style_on_toggle', {
                reason: 'toggleFollowUser (ON)',
                display: markerEl.style.display,
                width: markerEl.style.width,
                height: markerEl.style.height,
                verticalAlign: markerEl.style.verticalAlign,
                rotatorDisplay: rotatorEl ? rotatorEl.style.display : 'null'
            });
        }
        // --- 【★要件1 修正ここまで】 ---
        
        // --- 【★ 2025/11/12 修正】 (要件2) ---
        // moveend ではなく setTimeout でフラグを解除する
        // 【★要件2 修正】 強制センタリングの維持時間を 300ms から 1000ms に延長
        setTimeout(() => {
            appState.isForcingRecenter = false;
            logJSON('mapController.js', 'forcing_recenter_flag_unset', { 
                reason: 'timeout after toggleFollowUser (1000ms)',
                forcing_recenter_flag_timeout_extended: true // 【★要件2 ログ追加】
            });
        }, 1000); // 1000ms後にフラグを解除
        // --- 【★ 修正ここまで】 ---

        // 【★追加】Heading-Upモードの場合、回転基点も即座に更新する
        if (appState.mode === 'heading-up') {
             map.once('moveend', () => updateTransformOrigin('after_toggleFollowUser'));
        }

    } else if (!newState) { // 新しい状態 (false) の場合
        // --- 【★修正 2025/11/12】 ---
        // (要件4: 追従オフ時(ドラッグ操作)でも、Heading-Upモードの回転基点更新に必要な
        // イベントリスナー(moveend, viewreset)は解除しないように変更)
        
        // リスナーを解除しないことをログに残す
        logJSON('mapController.js', 'follow_off_listeners_kept', { 
            // --- 【★ 2025/11/14 修正】 (要望4) ---
            reason: triggerEvent // 'dragstart', 'zoomstart', 'button'
            // --- 【★ 修正ここまで】 ---
        });
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => console.error(`Fullscreen failed: ${err.message}`));
    } else {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }

    // --- 【★修正】 全画面切り替えボタン押下時にもサイズ再計算を明示的に呼び出す ---
    // 注: stabilizeAfterFullScreenでも呼び出されるが、確実性を高めるためにここでも実行
    // DOMの変更が反映されるのを待つために短い遅延を入れる
    setTimeout(() => {
        // 【★ 2025/11/13 修正】 stabilizeAfterFullScreen に処理を一本化するため、
        // ここでの invalidateSize 呼び出しは削除
        // map.invalidateSize();
    }, 100); 
}