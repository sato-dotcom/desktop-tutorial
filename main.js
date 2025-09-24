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
    
    // 全画面表示の変更を監視するイベントリスナー
    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('webkitfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('mozfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('MSFullscreenChange', stabilizeAfterFullScreen);

    // GPSとコンパスを開始
    startSensors();
    
    // G. 強制ハードチェック（動作復旧テストモード）
    setTimeout(() => {
        if (!compassInitialized) {
            console.log('[DEBUG-FORCE] no sensor → applied dummy raw=0 current=0');
            updateMapRotation(0, 0); // 配線とDOM適用の生存確認
            
            // さらに5秒間のシーケンスで回転経路を強制検証
            let step = 0;
            const sequence = [0, 90, 180, 270, 360];
            const sequenceInterval = setInterval(() => {
                if (step >= sequence.length) {
                    clearInterval(sequenceInterval);
                    return;
                }
                if (compassInitialized) { // もし途中で本物のセンサーが来たらテストは中止
                    console.log('[DEBUG-FORCE] Real sensor detected. Halting sequence.');
                    clearInterval(sequenceInterval);
                    return;
                }
                const target = sequence[step];
                console.log(`[DEBUG-FORCE] sequence step ${step} target=${target}`);
                // 擬似的にセンサー値を更新して通知
                lastRawHeading = target;
                currentHeading = target;
                updateMapRotation(lastRawHeading, currentHeading);
                step++;
            }, 1000);
        }
    }, 3000);

    // 保存されたデータを読み込み
    loadData();
};

