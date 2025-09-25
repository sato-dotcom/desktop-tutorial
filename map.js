// ... existing code ...
    const FullscreenControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.innerHTML = `<a id="fullscreen-btn" href="#" title="全画面表示" class="leaflet-control-custom-btn"><i class="fas fa-expand"></i></a>`;
            // L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation)
            //           .on(container, 'click', L.DomEvent.preventDefault)
            //           .on(container, 'click', toggleFullscreen);
            // ↑ main.js に処理を移譲するためコメントアウトまたは削除
            L.DomEvent.disableClickPropagation(container); // クリックイベントが地図に伝播しないようにする
            return container;
        }
    });
    map.addControl(new FullscreenControl());
    
    const OrientationControl = L.Control.extend({
// ... existing code ...
