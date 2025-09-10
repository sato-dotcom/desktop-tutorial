// main.js

// アプリケーションの初期化処理
window.onload = () => {
    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap();
    initializeCoordSystemSelector();
    
    // イベントリスナーを設定
    setupEventListeners(); 
    
    // ★★★ 変更点: プレフィックス付きのイベントリスナーを追加 ★★★
    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('webkitfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('mozfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('MSFullscreenChange', stabilizeAfterFullScreen);

    // GPSとコンパスを開始
    startGeolocation();
    startCompass();
    
    // 保存されたデータを読み込み
    loadData();

    // 描画ループを開始
    renderLoop();
};
