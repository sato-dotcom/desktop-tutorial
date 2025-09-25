// main.js

/**
 * アプリケーションの初期化処理
 */
window.onload = () => {
    console.log("--- 🚀 App Initializing ---");
    console.log(`Initial State: followUser=${appState.followUser}, headingUp=${appState.headingUp}, debug=${appState.debugEnabled}`);

    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap(); 
    initializeCoordSystemSelector();
    initializeUI();
    initializeDebugPanel();
    
    // --- DOM要素の取得とイベントリスナーの設定 ---
    dom.followUserBtn = document.getElementById('follow-user-btn');
    dom.orientationToggleBtn = document.getElementById('orientation-toggle-btn');
    dom.fullscreenBtn = document.getElementById('fullscreen-btn');

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

    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('webkitfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('mozfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('MSFullscreenChange', stabilizeAfterFullScreen);
    
    // センサーの起動を試みる
    startSensors();
    
    // 保存されたデータを読み込み
    loadData();
};

