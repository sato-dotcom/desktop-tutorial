// ui.js

// --- 内部状態変数 ---
let lastDebugUpdateTime = 0;
const LOG_THROTTLE_MS = 500; // デバッグUIの更新頻度（ミリ秒）

/**
 * UIの初期化とイベントリスナーの設定
 */
function initializeUI() {
    // 静的なイベントリスナー
    dom.modeAcquireTab.addEventListener('click', () => switchMode('acquire'));
    dom.modeNavigateTab.addEventListener('click', () => switchMode('navigate'));
    dom.recordPointBtn.addEventListener('click', handleRecordPoint);
    dom.exportCsvBtn.addEventListener('click', exportToCSV);
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
    dom.pointList.addEventListener('click', handlePointListClick);
    dom.importedPointList.addEventListener('click', handleImportedListClick);
    map.on('dragstart', () => {
        if (appState.followUser) {
            toggleFollowUser(false);
        }
    });
    dom.currentCoordSystemSelect.addEventListener('change', updateCurrentXYDisplay);
    dom.invertBearingBtn.addEventListener('click', toggleBearingInversion);

    // UIの初期状態を設定
    updateFollowButtonState();
    updateOrientationButtonState();
}

/**
 * デバッグパネルの表示を初期化/更新する
 */
function initializeDebugPanel() {
    dom.debugPanel = document.getElementById('debug-panel');
    if (appState.debugEnabled && dom.debugPanel) {
        dom.debugPanel.style.display = 'block';
    } else if (dom.debugPanel) {
        dom.debugPanel.style.display = 'none';
    }
}

/**
 * デバッグパネルの内容を更新する（スロットル制御付き）
 * @param {object} debugInfo - 表示するデバッグ情報
 */
function updateDebugPanel(debugInfo) {
    if (!appState.debugEnabled || !dom.debugPanel) return;

    const now = Date.now();
    if (now - lastDebugUpdateTime < LOG_THROTTLE_MS) return;
    lastDebugUpdateTime = now;
    
    const content = `
Mode      : ${debugInfo.mode}
raw/curr  : ${debugInfo.raw?.toFixed(1) ?? '--'}° / ${debugInfo.current?.toFixed(1) ?? '--'}°
relative  : ${debugInfo.relative?.toFixed(1) ?? '--'}°
target    : ${debugInfo.target?.toFixed(1) ?? '--'}° (Offset: ${ROTATION_OFFSET})
lastDrawn : ${(debugInfo.last || 0).toFixed(1)}°
diff      : ${(debugInfo.diff || 0).toFixed(1)}°
init/HB   : ${compassInitialized} / ${debugInfo.hbTicks}
`.trim();

    dom.debugPanel.textContent = content;
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
    dom.pointList.innerHTML = '';
    if (recordedPoints.length === 0) {
        dom.pointList.innerHTML = '<p class="text-gray-500 text-sm">まだ記録はありません。</p>';
    }

    dom.exportCsvBtn.disabled = recordedPoints.length === 0;
    dom.deleteAllBtn.disabled = recordedPoints.length === 0 && importedPoints.length === 0;

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
    dom.importedPointList.innerHTML = '';
    if (importedPoints.length === 0) {
        dom.importedPointList.innerHTML = '<p class="text-gray-500 text-sm">ファイルが読み込まれていません。</p>';
    } else {
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
    if (accuracy <= 0.5) { statusText = 'FIX'; }
    else if (accuracy <= 2.0) { statusText = 'FLOAT'; }
    else { statusText = 'SINGLE'; }
    currentGnssStatus = statusText;

    [dom.gnssStatus, dom.fullscreenGnssStatus].forEach(el => {
        if (!el) return;
        el.textContent = statusText;
        el.className = 'font-mono text-xs';
        if (statusText === 'FIX') el.classList.add('text-green-600', 'font-bold');
        else if (statusText === 'FLOAT') el.classList.add('text-blue-600', 'font-bold');
        else if (statusText === 'SINGLE') el.classList.add('text-orange-600', 'font-bold');
        else el.classList.add('text-gray-500');
    });
}

// --- 状態に依存するUI更新 ---

function updateFollowButtonState() {
    if (!dom.followUserBtn) return;
    dom.followUserBtn.classList.toggle('is-on', appState.followUser);
    dom.followUserBtn.classList.toggle('is-off', !appState.followUser);
    dom.followUserBtn.title = appState.followUser ? '現在地に追従中 (クリックで解除)' : '現在地への追従を再開';
}

function updateOrientationButtonState() {
    if (!dom.orientationToggleBtn) return;
    const icon = dom.orientationToggleBtn.querySelector('i');

    dom.orientationToggleBtn.classList.toggle('is-on', appState.headingUp);
    dom.orientationToggleBtn.classList.toggle('is-off', !appState.headingUp);

    if (appState.headingUp) {
        icon.className = 'fas fa-location-arrow';
        dom.orientationToggleBtn.title = 'マーカーが端末の向きを表示中 (北固定に切替)';
    } else {
        icon.className = 'fas fa-compass';
        dom.orientationToggleBtn.title = 'マーカーは北を固定表示中 (端末の向き表示に切替)';
    }
}

