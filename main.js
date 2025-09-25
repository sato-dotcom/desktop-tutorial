// ... existing code ...
    if (dom.orientationToggleBtn) {
        dom.orientationToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleHeadingUp(!appState.headingUp);
        });
    }

    // ★★★ 修正: fullscreenBtn のイベントリスナーをここに追加 ★★★
    if (dom.fullscreenBtn) {
        dom.fullscreenBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            toggleFullscreen();
        });
    }

    document.addEventListener('fullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('webkitfullscreenchange', stabilizeAfterFullScreen);
    document.addEventListener('mozfullscreenchange', stabilizeAfterFullScreen);
// ... existing code ...
