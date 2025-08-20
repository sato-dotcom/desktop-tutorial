/**
 * ブラウザの描画タイミングに合わせて、常に最新の状態で地図を再描画するループ。
 * このループは「回転」のみを担当します。
 */
function renderLoop() {
    updateMapRotation();
    requestAnimationFrame(renderLoop);
}

// アプリケーションの初期化処理
window.onload = () => {
    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap();
    initializeCoordSystemSelector();
    
    // イベントリスナーを先に設定してから、イベントを発火させる可能性のある処理(GPS)を開始します。
    // これにより、最初のGPS情報が来た時点で、UIが完全に応答できる状態になります。
    setupEventListeners(); 
    startGeolocation();
    
    startCompass();
    loadData();

    // 描画ループを開始
    renderLoop();
};
