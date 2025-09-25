// main.js

window.onload = () => {
    console.log("--- 🚀 App Initializing ---");

    initializeCoordSystemDefinitions();
    initializeMap(); 
    initializeCoordSystemSelector();
    initializeUI();
    initializeDebugPanel();
    
    dom.followUserBtn = document.getElementById('follow-user-btn');
    dom.orientationToggleBtn = document.getElementById('orientation-toggle-btn');
    dom.fullscreenBtn = document.getElementById('fullscreen-btn');

    // ★★★ 変更点: 権限取得フローを開始 ★★★
    setupSensorPermissionFlow();

    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('webkitfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('mozfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('MSFullscreenChange', stabilizeAfterFullScreen);
    
    // ページ復帰時のリスナー再アタッチ
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', () => clearInterval(heartbeatInterval));
    window.addEventListener('pageshow', handleVisibilityChange);

    loadData();
};

/**
 * ★★★ 新規追加: センサー権限取得のフローを管理 ★★★
 */
function setupSensorPermissionFlow() {
    const startSensorsHandler = () => {
        // Remove listeners to avoid multiple triggers
        dom.startSensorsBtn.removeEventListener('click', startSensorsHandler);
        dom.startSensorsBtn.removeEventListener('touchstart', startSensorsHandler);

        startSensors().then(() => {
            dom.sensorPermissionOverlay.classList.add('hidden');
        }).catch(err => {
            console.error("Sensor initialization failed:", err);
            alert("センサーの初期化に失敗しました。ページを再読み込みして再度お試しください。");
        });
    };

    dom.startSensorsBtn.addEventListener('click', startSensorsHandler);
    dom.startSensorsBtn.addEventListener('touchstart', startSensorsHandler);

    // 3秒後にユーザー操作がなければオーバーレイを強制表示
    setTimeout(() => {
        if (!compassInitialized) {
            console.log("[DEBUG-FORCE] no user gesture → prompt");
            dom.sensorPermissionOverlay.classList.remove('hidden');
        }
    }, 3000);
}

/**
 * ★★★ 新規追加: ページ表示状態の変更をハンドル ★★★
 */
function handleVisibilityChange() {
    if (document.visibilityState === 'visible') {
        console.log("[DEBUG-WIRE] page show → reattach listeners");
        if (compassInitialized) { // 既に一度開始されている場合のみ
            startSensors().catch(err => console.error("Re-attaching sensors failed:", err));
        }
    } else {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
    }
}

