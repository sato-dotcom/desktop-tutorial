/**
 * mapController.js
 * state.jsから渡された状態に基づき、地図やマーカーの表示を更新する。
 */

let rotationCenterMarker = null; // 回転中心マーカーのインスタンスを保持

/**
 * 位置情報に基づいて現在地マーカーを生成・更新する
 * @param {GeolocationPosition} position - GPSから取得した位置情報
 */
function updatePosition(position) {
    const latlng = [position.coords.latitude, position.coords.longitude];

    // ---【★修正】アイコンのHTMLを共通化 ---
    const userIconHTML = `
        <div id="userMarker" class="user-marker" data-role="user">
            <div class="user-location-marker-rotator">
                <svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg>
            </div>
        </div>`;

    if (currentUserMarker === null) {
        // --- 初回: マーカーを生成 ---
        const userIcon = L.divIcon({
            html: userIconHTML,
            className: 'user-marker',
            iconSize: [30, 30],
            // 【★修正】 iconAnchorは[15, 15]で中央基準に固定
            iconAnchor: [15, 15] 
        });
        
        currentUserMarker = L.marker(latlng, { icon: userIcon, pane: 'markerPane' }).addTo(map);
        // 【修正】現在地マーカーを最前面に表示
        currentUserMarker.setZIndexOffset(1000);

        logJSON('mapController.js', 'marker_created', { lat: latlng[0], lon: latlng[1] });

        logJSON('mapController.js', 'marker_anchor_check', {
         iconAnchor: currentUserMarker.options.icon.options.iconAnchor,
         iconSize: currentUserMarker.options.icon.options.iconSize,
         lat: latlng[0],
         lon: latlng[1]
        });

    } else {
        // --- 2回目以降: マーカー位置を更新 ---
        currentUserMarker.setLatLng(latlng);

        // ---【★修正】iconAnchorが確実に適用されるよう、setIconでアイコンを再設定 ---
        currentUserMarker.setIcon(
            L.divIcon({
                html: userIconHTML,
                className: 'user-marker',
                iconSize: [30, 30],
                iconAnchor: [15, 15] // アイコン中央を基準にする
            })
        );
        // 【修正】アイコン再設定時もZ-Indexを維持
        currentUserMarker.setZIndexOffset(1000);

        logJSON('mapController.js', 'marker_updated', { lat: latlng[0], lon: latlng[1] });

        // ★追加：更新時にも anchor を確認
        logJSON('mapController.js', 'marker_anchor_check_update', {
         iconAnchor: currentUserMarker.options.icon.options.iconAnchor,
         iconSize: currentUserMarker.options.icon.options.iconSize,
         lat: latlng[0],
         lon: latlng[1]
        });
    }
    
    // UIパネルの情報は常に更新
    updateAllInfoPanels(position);

    // --- 【修正】追従モードがオフの場合は、地図を動かさずにここで処理を終了 ---
    // これにより、Heading-Upモードでも追従オフ時に勝手に地図が動くのを防ぐ
    if (!appState.followUser) {
        logJSON('mapController.js', 'follow_guard_active', {
            reason: 'followUser is false',
            mode: appState.mode
        });
        return; 
    }

    // --- 地図の中心を更新 (追従オン時のみ実行される) ---
    if (appState.mode === 'north-up') {
        // --- North-Up時はsetViewのみで中央固定し、直後にログ出力 ---
        logJSON('mapController.js', 'setView_called', {
            followUser: appState.followUser,
            reason: 'updatePosition (north-up)',
            target: latlng
        });
        map.setView(latlng, map.getZoom(), { animate: false });
        logJSON('mapController.js', 'recenter', {
            reason: 'north-up-follow',
            markerAnchor: 'center'
        });
    } else if (appState.mode === 'heading-up') {
        // Heading-upモードでは常に中央に強制配置し、移動完了後に回転基点を再計算
        logJSON('mapController.js', 'setView_called', {
            followUser: appState.followUser,
            reason: 'updatePosition (heading-up)',
            target: latlng
        });
        map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
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
        // (この部分は今回の修正対象外)
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

        logJSON('mapController.js', 'north_up_transform_check', {
            mapPaneTransform: mapPane.style.transform,
            mapPaneOrigin: mapPane.style.transformOrigin,
            rotatorTransform: rotator.style.transform,
            rotatorOrigin: rotator.style.transformOrigin
        });

        const markerEl_dom = document.getElementById('userMarker');
        if (markerEl_dom) {
            const rect = markerEl_dom.getBoundingClientRect();
            logJSON('mapController.js', 'north_up_dom_check', {
                width: rect.width,
                height: rect.height,
                offsetTop: markerEl_dom.offsetTop,
                offsetLeft: markerEl_dom.offsetLeft
            });
        }

        const markerEl = document.getElementById('userMarker');
        if (markerEl) {
          // (デバッグ用ログ出力は省略せず維持)
          const styleOuter = window.getComputedStyle(markerEl);
          const rotatorEl = markerEl.querySelector('.user-location-marker-rotator');
          const styleRotator = rotatorEl ? window.getComputedStyle(rotatorEl) : {};
          const svgEl = markerEl.querySelector('svg');
          const styleSvg = svgEl ? window.getComputedStyle(svgEl) : {};
    
          logJSON('mapController.js', 'north_up_style_deepcheck', {
            outer: {
              display: styleOuter.display,
              lineHeight: styleOuter.lineHeight,
              verticalAlign: styleOuter.verticalAlign
            },
            rotator: {
              display: styleRotator.display,
              lineHeight: styleRotator.lineHeight,
              verticalAlign: styleRotator.verticalAlign
            },
            svg: {
              display: styleSvg.display,
              lineHeight: styleSvg.lineHeight,
              verticalAlign: styleSvg.verticalAlign
            }
          });

          logJSON('mapController.js', 'north_up_dom_structure', {
            outerHTML: markerEl.outerHTML
          });

          // 強制的に inline style を付与
          markerEl.style.display = 'flex';
          markerEl.style.alignItems = 'center';
          markerEl.style.justifyContent = 'center';
          markerEl.style.width = '30px';
          markerEl.style.height = '30px';
          markerEl.style.lineHeight = '30px';
          markerEl.style.verticalAlign = 'middle';

          const styleCheck = window.getComputedStyle(markerEl);
          logJSON('mapController.js', 'north_up_inline_style_check', {
            display: styleCheck.display,
            lineHeight: styleCheck.lineHeight,
            verticalAlign: styleCheck.verticalAlign,
            width: styleCheck.width,
            height: styleCheck.height
          });
          
          // ---【ここから修正】---
          const rotator_test = markerEl.querySelector('.user-location-marker-rotator');
          if (rotator_test) {
            rotator_test.style.display = 'flex';
            rotator_test.style.alignItems = 'center';
            rotator_test.style.justifyContent = 'center';
            rotator_test.style.width = '30px';
            rotator_test.style.height = '30px';
            rotator_test.style.lineHeight = '30px';
            rotator_test.style.verticalAlign = 'middle';

            const styleRotator_test = window.getComputedStyle(rotator_test);
            logJSON('mapController.js', 'north_up_inline_rotator_check', {
              display: styleRotator_test.display,
              lineHeight: styleRotator_test.lineHeight,
              verticalAlign: styleRotator_test.verticalAlign,
              width: styleRotator_test.width,
              height: styleRotator_test.height
            });
          }
          // ---【ここまで修正】---
        }
        
        // ---【ここから修正】---
        if (map && currentUserMarker) {
           logJSON('mapController.js', 'marker_vs_map_center', {
             mapCenter: map.getCenter(),
             markerPos: currentUserMarker.getLatLng()
           });
        }
        // ---【ここまで修正】---
        
        // 状態変数をリセット
        lastDrawnMarkerAngle = 0;
        lastDrawnMapAngle = null;
        lastMapHeading = null;

        logJSON('mapController.js', 'apply_heading_north_up_fixed', {
            mode: appState.mode,
            map_rotation: '0 (fixed)',
            marker_rotation: '0 (fixed)',
        });
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
    
    // 【修正】全画面切替後の位置補正も、追従モードONの時のみ行う
    if (appState.position && appState.followUser) {
        const coords = appState.position.coords;
        const latlng = [coords.latitude, coords.longitude];
        
        if (appState.mode === 'north-up') {
            // --- 全画面切替後の中央固定処理 ---
            map.once('viewreset', () => { 
                // 追従オフへの変更を検知するためのガード
                if (!appState.followUser) return;
                
                // setViewで中央固定し、指定されたログを出力
                logJSON('mapController.js', 'setView_called', {
                    followUser: appState.followUser,
                    reason: 'stabilizeAfterFullScreen (north-up)',
                    target: latlng
                });
                map.setView(latlng, map.getZoom(), { animate: false });
                 logJSON('mapController.js', 'recenter', {
                    reason: 'north-up-fullscreen',
                    markerAnchor: 'center'
                });

                map.once('moveend', () => {
                    if (!appState.followUser) return;
                    logJSON('mapController.js', 'center_check', {
                       data: { center: map.getCenter(), zoom: map.getZoom() }
                    });
                });
            });
        } else if (appState.mode === 'heading-up') {
            logJSON('mapController.js', 'setView_called', {
                followUser: appState.followUser,
                reason: 'stabilizeAfterFullScreen (heading-up)',
                target: latlng
            });
            map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
            map.once('moveend', () => updateTransformOrigin('heading-up-fullscreen'));
        }
    }
}

// この関数はNorth-Upモードでは使用されない
function recenterAbsolutely(coords) {
    if (!map || !coords) return;
    // 【修正】ここにも念のためガードを入れておく
    if (!appState.followUser) {
         logJSON('mapController.js', 'recenterAbsolutely_skipped', { reason: 'followUser is false' });
         return;
    }

    const latlng = [coords.latitude, coords.longitude];
    logJSON('mapController.js', 'setView_called', {
        followUser: appState.followUser,
        reason: 'recenterAbsolutely',
        target: latlng
    });
    map.setView(latlng, map.getZoom(), { animate: false, noMoveStart: true });
}

function toggleFollowUser(on) {
    appState.followUser = on;
    updateFollowButtonState();
    
    if (on && appState.position) {
        updatePosition(appState.position);
    } else if (!on) {
        // --- 【要件3】 追従オフ時に予約済みのリスナーを全て解除 ---
        map.off('moveend');
        map.off('viewreset');
        logJSON('mapController.js', 'listeners_cleared', { reason: 'follow_off' });
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
        map.invalidateSize();
    }, 100); 
}