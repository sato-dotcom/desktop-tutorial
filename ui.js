function setupEventListeners() {
    dom.followUserBtn = document.getElementById('follow-user-btn');
    
    // ★★★ 2) 追従ボタンのイベント接続は main.js に移動 ★★★
    
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
        // ドラッグを開始したら、追従モードを強制的にOFFにする
        if (appState.followUser) {
            toggleFollowUser(false); // 新しい関数を呼ぶ
        }
    });
    
    dom.currentCoordSystemSelect.addEventListener('change', updateCurrentXYDisplay);
    dom.invertBearingBtn.addEventListener('click', toggleBearingInversion);
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
    } else {
        dom.exportCsvBtn.disabled = false;
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

// ★★★ 4) 古い追従処理の無効化 ★★★
// toggleFollowUser と updateFollowButtonState は mapController.js に移行したため削除
