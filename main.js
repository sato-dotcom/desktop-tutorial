// main.js

// アプリケーションの初期化処理
window.onload = () => {
    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap(); // ここでUIコントロール(ボタン)がDOMに追加される
    initializeCoordSystemSelector();
    
    // イベントリスナーを設定 (ボタン以外)
    setupEventListeners(); 
    
    // ★★★ 2) UIイベント接続をここで行う ★★★
    const followUserBtn = document.getElementById('follow-user-btn');
    if (followUserBtn) {
        followUserBtn.addEventListener('click', (e) => {
             e.preventDefault();
             e.stopPropagation();
             toggleFollowUser(!appState.followUser);
        });
    }

    const orientationBtn = document.getElementById('orientation-toggle-btn');
    if (orientationBtn) {
        orientationBtn.addEventListener('click', (e) => {
             e.preventDefault();
             e.stopPropagation();
             toggleHeadingUp(!appState.headingUp);
        });
    }
    
    // 全画面表示のイベントリスナー
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

