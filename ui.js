// ... existing code ... -->
    dom.modeAcquireTab.addEventListener('click', () => switchMode('acquire'));
    dom.modeNavigateTab.addEventListener('click', () => switchMode('navigate'));
    dom.recordPointBtn.addEventListener('click', handleRecordPoint);
    dom.exportCsvBtn.addEventListener('click', exportToCSV);
    dom.deleteAllBtn.addEventListener('click', () => dom.deleteAllConfirmModal.classList.add('is-open'));
    
    dom.importCsvBtn.addEventListener('click', () => dom.csvFileInput.click());
// ... existing code ... -->
        dom.deleteConfirmModal.classList.remove('is-open');
        indexToDelete = null;
    });
    dom.cancelDeleteAllBtn.addEventListener('click', () => dom.deleteAllConfirmModal.classList.remove('is-open'));
    dom.confirmDeleteAllBtn.addEventListener('click', deleteAllData);

    dom.pointList.addEventListener('click', handlePointListClick);
    dom.importedPointList.addEventListener('click', handleImportedListClick);

    map.on('dragstart', () => {
// ... existing code ... -->
function updatePointList() {
    if (recordedPoints.length === 0) {
        dom.pointList.innerHTML = '<p class="text-gray-500 text-sm">まだ記録はありません。</p>';
        dom.exportCsvBtn.disabled = true;
    } else {
        dom.exportCsvBtn.disabled = false;
    }
    
    dom.deleteAllBtn.disabled = recordedPoints.length === 0 && importedPoints.length === 0;
// ... existing code ... -->
