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
    initializeMap(); // Leaflet地図とコントロールを初期化
    initializeCoordSystemSelector();

    // --- DOM要素の取得とイベントリスナーの設定 ---
    // LeafletコントロールがDOMに追加された後に要素を取得
    dom.followUserBtn = document.getElementById('follow-user-btn');
    dom.orientationToggleBtn = document.getElementById('orientation-toggle-btn');
    dom.fullscreenBtn = document.getElementById('fullscreen-btn');

    initializeUI();  // 静的イベントリスナーとUIの初期状態を設定

    // --- 状態に依存する動的なイベントリスナーをここで設定 ---
    if (dom.followUserBtn) {
        dom.followUserBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFollowUser(!appState.followUser);
        });
    }
    if (dom.orientationToggleBtn) {
        dom.orientationToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleHeadingUp(!appState.headingUp);
        });
    }
    if (dom.fullscreenBtn) {
        // イベント接続はmap.jsのコントロール定義内で行われているため、ここでは不要
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
