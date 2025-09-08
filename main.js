// アプリケーションの初期化処理
window.onload = () => {
    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap();
    initializeCoordSystemSelector();
    
    // イベントリスナーを設定
    setupEventListeners(); 
    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);

    // GPSとコンパスを開始
    startGeolocation();
    startCompass();
    
    // 保存されたデータを読み込み
    loadData();

    // 描画ループを開始
    renderLoop();
};
