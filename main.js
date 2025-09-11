// main.js

/**
 * アプリケーションの初期化処理
 */
window.onload = () => {
    // ログで初期状態を出力
    console.log("--- 🚀 App Initializing ---");
    console.log(`Initial State: followUser=${appState.followUser}, headingUp=${appState.headingUp}`);

    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap(); // Leaflet地図の初期化
    initializeCoordSystemSelector();
    initializeUI();  // DOM要素の取得と静的イベントリスナーの設定

    // --- 状態に依存する動的なイベントリスナーをここで設定 ---
    if (dom.followUserBtn) {
        dom.followUserBtn.addEventListener('click', () => toggleFollowUser(!appState.followUser));
    }
    if (dom.orientationToggleBtn) {
        dom.orientationToggleBtn.addEventListener('click', () => toggleHeadingUp(!appState.headingUp));
    }
    if (dom.fullscreenBtn) {
        dom.fullscreenBtn.addEventListener('click', () => {
            if (!document.fullscreenElement && !document.webkitFullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => alert(`Fullscreen failed: ${err.message}`));
            } else {
                if (document.exitFullscreen) document.exitFullscreen();
                else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            }
        });
    }

    // 全画面表示の変更を監視するイベントリスナー
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

