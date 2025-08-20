/**
 * 絶対位置基準方式
 * ユーザー座標とアンカー位置だけを使って、毎回ゼロから中心を計算する。
 * これにより、誤差が蓄積せず、基準がブレない安定した表示を実現する。
 *
 * @param {boolean} force - true の場合はアニメーションなしで即座に再配置する
 */
function updateMapView(force = false) {
    if (!map || !currentPosition) return;

    // 追従OFFかつ通常更新（force=false）なら、絶対に地図を動かさない
    if (!window.isFollowingUser && !force) {
        return;
    }

    const container = map.getContainer();
    const w = container.clientWidth;
    const h = container.clientHeight;

    // 1. アンカー位置（ユーザーを配置したい画面上の目標地点）を決定
    const targetPoint = L.point(
        w / 2,
        (mapOrientationMode === 'north-up') ? (h / 2) : (h * 0.75)
    );

    const userLatLng = L.latLng(
        currentPosition.coords.latitude,
        currentPosition.coords.longitude
    );
    const zoom = map.getZoom();

    // force=true（全画面切替など）の時は、計算方法を根本的に変更
    if (force) {
        // 手順1: まず、ユーザーの緯度経度を「画面のど真ん中」に強制的に配置する
        map.setView(userLatLng, zoom, { animate: false });

        // 手順2: 「画面中央」と「本来置きたいアンカー位置」のピクセル差を計算
        const centerPoint = L.point(w / 2, h / 2);
        const offsetPx = targetPoint.subtract(centerPoint); 

        // 手順3: 計算したピクセル差の分だけ、地図を「ずらす」(panBy)
        if (offsetPx.x !== 0 || offsetPx.y !== 0) {
            map.panBy(offsetPx, { animate: false });
        }
        return; // 強制配置の場合はここで処理を終了
    }

    // --- 以下は通常の追従時（force=false）のスムーズな移動処理 ---
    const userPoint = map.latLngToContainerPoint(userLatLng);
    const newCenterPoint = userPoint.subtract(L.point(w / 2, h / 2)).add(targetPoint);
    const newCenter = map.containerPointToLatLng(newCenterPoint);

    if (window.isFollowingUser) {
        const currentCenter = map.getCenter();
        if (Math.abs(currentCenter.lat - newCenter.lat) > 0.00001 ||
            Math.abs(currentCenter.lng - newCenter.lng) > 0.00001) {
            map.panTo(newCenter, { animate: true, duration: 0.2, easeLinearity: 0.5 });
        }
    }
}

/**
 * ユーザー位置マーカーだけを更新する（地図は動かさない）
 * @param {GeolocationPosition} position - 現在位置情報
 */
function updateUserMarkerOnly(position) {
    if (!currentUserMarker || !position) return;
    const latlng = [position.coords.latitude, position.coords.longitude];
    currentUserMarker.setLatLng(latlng);
}

/**
 * 追従状態に関わらず、現在地を画面中央に即座にスナップさせるヘルパー関数
 */
function centerOnUserAtScreenCenter() {
    if (!map || !currentPosition) return;
    
    // 念のためマーカー位置を最新に更新
    updateUserMarkerOnly(currentPosition);

    // 画面の真ん中に「絶対配置」する
    const latlng = L.latLng(
        currentPosition.coords.latitude,
        currentPosition.coords.longitude
    );
    map.setView(latlng, map.getZoom(), { animate: false });
}


function setupEventListeners() {
    dom.followUserBtn = document.getElementById('follow-user-btn');
    updateFollowButtonState();

    if (dom.followUserBtn) {
        dom.followUserBtn.addEventListener('click', toggleFollowUser);
    }

    dom.modeAcquireTab.addEventListener('click', () => switchMode('acquire'));
    dom.modeNavigateTab.addEventListener('click', () => switchMode('navigate'));
    dom.recordPointBtn.addEventListener('click', handleRecordPoint);
    dom.exportCsvBtn.addEventListener('click', exportToCSV);
    dom.generateReportBtn.addEventListener('click', handleGenerateReport);
    dom.deleteAllBtn.addEventListener('click', () => dom.deleteAllConfirmModal.classList.add('is-open'));
    
    dom.importCsvBtn.addEventListener('click', () => dom.csvFileInput.click());
    dom.csvFileInput.addEventListener('change', handleFileImport);
    
    dom.manualInputLatLonTab.addEventListener('click', () => switchManualInput('latlon'));
    dom.manualInputXyTab.addEventListener('click', () => switchManualInput('xy'));
    dom.setTargetBtn.addEventListener('click', handleSetTargetManual);
    
    dom.savePointNameBtn.addEventListener('click', savePointName);
    dom.cancelPointNameBtn.addEventListener('click', () => dom.pointNameModal.classList.remove('is-open'));
    dom.suggestNameBtn.addEventListener('click', handleSuggestName);
    dom.cancelDeleteBtn.addEventListener('click', () => {
        dom.deleteConfirmModal.classList.remove('is-open');
        indexToDelete = null;
    });
    dom.confirmDeleteBtn.addEventListener('click', () => {
        if (indexToDelete !== null) {
            map.removeLayer(recordedPoints[indexToDelete].marker);
            recordedPoints.splice(indexToDelete, 1);
            updatePointList();
            saveData();
        }
        dom.deleteConfirmModal.classList.remove('is-open');
        indexToDelete = null;
    });
    dom.cancelDeleteAllBtn.addEventListener('click', () => dom.deleteAllConfirmModal.classList.remove('is-open'));
    dom.confirmDeleteAllBtn.addEventListener('click', deleteAllData);

    dom.closeReportBtn.addEventListener('click', () => dom.reportModal.classList.remove('is-open'));
    dom.copyReportBtn.addEventListener('click', copyReportToClipboard);

    dom.pointList.addEventListener('click', handlePointListClick);
    dom.importedPointList.addEventListener('click', handleImportedListClick);

    map.on('dragstart', () => {
        if (window.isFollowingUser) {
            window.isFollowingUser = false;
            updateFollowButtonState();
            map.stop(); // ドラッグ開始時にもアニメーションを停止
        }
    });
    
    dom.currentCoordSystemSelect.addEventListener('change', updateCurrentXYDisplay);
    dom.invertBearingBtn.addEventListener('click', toggleBearingInversion);

    // ★★★ 修正点: デバウンス処理を導入 ★★★
    let resizeTimer;
    window.addEventListener('resize', () => {
        // 既存のタイマーをクリア
        clearTimeout(resizeTimer);
        // 新しいタイマーを設定
        resizeTimer = setTimeout(() => {
            map.invalidateSize({ pan: false });
            // リサイズ完了後、追従がONの時だけ再配置する
            if (window.isFollowingUser) {
                updateMapView(true);
            }
        }, 150); // 150msの遅延
    });
}

function switchMode(mode) {
    currentMode = mode;
    if (mode === 'acquire') {
        dom.modeAcquireTab.classList.add('text-blue-600', 'border-blue-600');
        dom.modeAcquireTab.classList.remove('text-gray-500');
        dom.modeNavigateTab.classList.remove('text-blue-600', 'border-blue-600');
        dom.modeNavigateTab.classList.add('text-gray-500');
        dom.panelAcquire.style.display = 'block';
        dom.panelNavigate.style.display = 'none';
        clearNavigation();
    } else { // navigate
        dom.modeNavigateTab.classList.add('text-blue-600', 'border-blue-600');
        dom.modeNavigateTab.classList.remove('text-gray-500');
        dom.modeAcquireTab.classList.remove('text-blue-600', 'border-blue-600');
        dom.modeAcquireTab.classList.add('text-gray-500');
        dom.panelAcquire.style.display = 'none';
        dom.panelNavigate.style.display = 'block';
    }
}

function switchManualInput(mode) {
    manualInputMode = mode;
    if (mode === 'latlon') {
        dom.manualInputLatLonPanel.classList.remove('hidden');
        dom.manualInputXyPanel.classList.add('hidden');
        dom.manualInputLatLonTab.classList.add('bg-purple-500', 'text-white');
        dom.manualInputLatLonTab.classList.remove('bg-gray-200', 'text-gray-600');
        dom.manualInputXyTab.classList.add('bg-gray-200', 'text-gray-600');
        dom.manualInputXyTab.classList.remove('bg-purple-500', 'text-white');
    } else { // xy
        dom.manualInputLatLonPanel.classList.add('hidden');
        dom.manualInputXyPanel.classList.remove('hidden');
        dom.manualInputXyTab.classList.add('bg-purple-500', 'text-white');
        dom.manualInputXyTab.classList.remove('bg-gray-200', 'text-gray-600');
        dom.manualInputLatLonTab.classList.add('bg-gray-200', 'text-gray-600');
        dom.manualInputLatLonTab.classList.remove('bg-purple-500', 'text-white');
    }
}

function updatePointList() {
    if (recordedPoints.length === 0) {
        dom.pointList.innerHTML = '<p class="text-gray-500 text-sm">まだ記録はありません。</p>';
        dom.exportCsvBtn.disabled = true;
        dom.generateReportBtn.disabled = true;
    } else {
        dom.exportCsvBtn.disabled = false;
        dom.generateReportBtn.disabled = false;
    }
    
    dom.deleteAllBtn.disabled = recordedPoints.length === 0 && importedPoints.length === 0;

    dom.pointList.innerHTML = '';
    recordedPoints.forEach((p, index) => {
        const item = document.createElement('div');
        const visibilityClass = p.isVisible ? '' : 'opacity-50';
        const iconClass = p.isVisible ? 'fa-eye' : 'fa-eye-slash';
        const iconColor = p.isVisible ? 'text-gray-500' : 'text-gray-300';
        
        item.className = `p-2 border-b flex justify-between items-center ${visibilityClass}`;
        item.innerHTML = `
            <div>
                <p class="font-semibold text-sm">${p.name}</p>
                <p class="text-xs font-mono">Lat: ${p.lat.toFixed(6)}, Lon: ${p.lon.toFixed(6)}</p>
            </div>
            <div class="flex items-center">
                <button class="toggle-visibility-btn ${iconColor} hover:text-blue-500 p-2" data-index="${index}">
                    <i class="fas ${iconClass}"></i>
                </button>
                <button class="delete-point-btn text-red-500 hover:text-red-700 p-2" data-index="${index}">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        dom.pointList.appendChild(item);
    });
}

function updateImportedPointList() {
    if (importedPoints.length === 0) {
        dom.importedPointList.innerHTML = '<p class="text-gray-500 text-sm">ファイルが読み込まれていません。</p>';
    } else {
         dom.importedPointList.innerHTML = '';
        importedPoints.forEach((p, index) => {
            const item = document.createElement('div');
            const visibilityClass = p.isVisible ? '' : 'opacity-50';
            const iconClass = p.isVisible ? 'fa-eye' : 'fa-eye-slash';
            const iconColor = p.isVisible ? 'text-gray-500' : 'text-gray-300';

            item.className = `p-2 border-b flex justify-between items-center`;
            item.innerHTML = `
                <div class="flex-grow cursor-pointer hover:bg-gray-100 rounded p-1 ${visibilityClass}" data-index="${index}" data-action="set-target">
                    <p class="font-semibold text-sm pointer-events-none">${p.name}</p>
                    <p class="text-xs font-mono pointer-events-none">Lat: ${p.lat.toFixed(6)}, Lon: ${p.lon.toFixed(6)}</p>
                </div>
                <button class="toggle-visibility-btn ${iconColor} hover:text-blue-500 p-2" data-index="${index}" data-action="toggle">
                    <i class="fas ${iconClass}"></i>
                </button>
            `;
            dom.importedPointList.appendChild(item);
        });
    }
    dom.deleteAllBtn.disabled = recordedPoints.length === 0 && importedPoints.length === 0;
}

function handlePointListClick(e) {
    const target = e.target.closest('button');
    if (!target) return;

    const index = parseInt(target.dataset.index);
    if (target.classList.contains('toggle-visibility-btn')) {
        togglePointVisibility(index, 'recorded');
    } else if (target.classList.contains('delete-point-btn')) {
        showDeleteConfirmation(index);
    }
}

function handleImportedListClick(e) {
    const target = e.target.closest('[data-action]');
    if (!target) return;

    const index = parseInt(target.dataset.index);
    const action = target.dataset.action;

    if (action === 'toggle') {
        togglePointVisibility(index, 'imported');
    } else if (action === 'set-target') {
        const point = importedPoints[index];
        if (point) handleSetTargetFromImport(point);
    }
}

function showDeleteConfirmation(index) {
    if (index < 0 || index >= recordedPoints.length) return;
    indexToDelete = index;
    const pointName = recordedPoints[index].name;
    dom.deleteConfirmText.textContent = `「${pointName}」を本当に削除しますか？`;
    dom.deleteConfirmModal.classList.add('is-open');
}

function updateCurrentXYDisplay() {
    if (currentPosition) {
        const { latitude, longitude } = currentPosition.coords;
        const selectedZone = dom.currentCoordSystemSelect.value;
        const xy = convertToXY(latitude, longitude, selectedZone);
        dom.currentX.textContent = xy.x.toFixed(3);
        dom.currentY.textContent = xy.y.toFixed(3);
    }
}

function updateGnssStatus(accuracy) {
    let statusText = '---';
    let statusColor = 'text-gray-500';
    if (accuracy <= 0.5) {
        statusText = 'FIX';
        statusColor = 'text-green-600 font-bold';
    } else if (accuracy <= 2.0) {
        statusText = 'FLOAT';
        statusColor = 'text-blue-600 font-bold';
    } else {
        statusText = 'SINGLE';
        statusColor = 'text-orange-600 font-bold';
    }
    currentGnssStatus = statusText;
    dom.gnssStatus.textContent = statusText;
    dom.gnssStatus.className = `font-mono text-xs ${statusColor}`;
    dom.fullscreenGnssStatus.textContent = statusText;
    dom.fullscreenGnssStatus.className = `font-mono text-xs ${statusColor}`;
}

/**
 * 追従ON/OFFを切り替える関数
 */
function toggleFollowUser() {
    window.isFollowingUser = !window.isFollowingUser;
    updateFollowButtonState();

    if (window.isFollowingUser) {
        // 追従を再開した瞬間に、地図を強制的に現在地へスナップさせる
        if (currentPosition) {
            updateMapView(true);
        }
    } else {
        // 追従をOFFにした時、進行中の地図アニメーション（panTo）を即座に停止する
        map.stop();
    }
}


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
    
    // 追従ONのときだけ、地図の中心を再配置する
    if (window.isFollowingUser) {
        updateMapView(true);
    }
}

/**
 * 全画面表示を切り替える関数
 */
function toggleFullscreen() {
    // 1. UIの状態（クラスとアイコン）を切り替え
    document.body.classList.toggle('fullscreen-active');

    const btn = document.getElementById('fullscreen-btn');
    const icon = btn.querySelector('i');
    if (document.body.classList.contains('fullscreen-active')) {
        icon.classList.remove('fa-expand');
        icon.classList.add('fa-compress');
        btn.title = '通常表示に戻る';
    } else {
        icon.classList.remove('fa-compress');
        icon.classList.add('fa-expand');
        btn.title = '全画面表示';
    }

    // 進行中のアニメーションを停止
    map.stop();

    // 2. Leafletに地図コンテナのサイズが変更されたことを通知する。
    // この命令の完了後、Leafletは内部的に 'resize' イベントを発火させる。
    map.invalidateSize();

    // 3. 'resize' イベントを一度だけ捕捉し、再描画処理を実行する。
    map.once('resize', () => {
        // 現在地情報がある場合のみ、強制再描画を実行
        if (currentPosition) {
            updateMapView(true);
        }
    });
}
