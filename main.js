// main.js

/**
 * アプリケーションの初期化処理
 */
window.onload = () => {
    console.log("--- 🚀 App Initializing ---");

    // 各種初期化
    initializeCoordSystemDefinitions();
    initializeMap(); 
    initializeCoordSystemSelector();

    // LeafletコントロールがDOMに追加された後に要素を取得
    dom.followUserBtn = document.getElementById('follow-user-btn');
    dom.orientationToggleBtn = document.getElementById('orientation-toggle-btn');
    dom.fullscreenBtn = document.getElementById('fullscreen-btn');
    
    initializeUI();
    initializeDebugPanel(); // デバッグパネルを初期化

    // 状態に依存する動的なイベントリスナー
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

    // 全画面表示の変更を監視
    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('webkitfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('mozfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('MSFullscreenChange', stabilizeAfterFullScreen);

    // GPSとコンパスを開始
    startSensors();
    
    // 保存されたデータを読み込み
    loadData();

    // 強制動作検証（テストモード）
    setTimeout(() => {
        if (!compassInitialized) {
            console.log('[DEBUG-FORCE] no sensor → applied dummy raw=0 current=0');
            updateMapRotation(0, 0);

            const sequence = [90, 180, 270, 0];
            let step = 0;
            const sequenceInterval = setInterval(() => {
                if (compassInitialized || step >= sequence.length) {
                    clearInterval(sequenceInterval);
                    return;
                }
                const target = sequence[step];
                console.log(`[DEBUG-FORCE] sequence step ${step} target=${target}`);
                updateMapRotation(target, target);
                step++;
            }, 1000);
        }
    }, 3000);
};

