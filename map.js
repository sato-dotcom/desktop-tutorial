function initializeMap() {
    // --- 地図タイルの定義 (変更なし) ---
    const customBathymetryLayer = L.tileLayer('https://deep-c33f42.netlify.app/{z}/{x}/{y}.png', {
        attribution: 'カスタム等深図',
        maxZoom: 22,
        minZoom: 0, 
        maxNativeZoom: 15
    });
    const gsiReliefLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/relief/{z}/{x}/{y}.png', {
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
        maxZoom: 22, maxNativeZoom: 15 
    });
    const gsiStdLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png', {
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
        maxZoom: 22, maxNativeZoom: 18
    });
    const gsiPhotoLayer = L.tileLayer('https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg', {
        attribution: '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank">国土地理院</a>',
        maxZoom: 22, maxNativeZoom: 18
    });
    
    map = L.map(dom.map, { zoomControl: false, layers: [gsiReliefLayer] }).setView([36.2, 133.1], 12);
    customBathymetryLayer.addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    
    const baseMaps = { 
        "海底地形図 (国土地理院)": gsiReliefLayer,
        "標準地図 (等高線)": gsiStdLayer, 
        "航空写真": gsiPhotoLayer
    };
    const overlayMaps = {
        "カスタム等深図 (重ね表示)": customBathymetryLayer
    };
    L.control.layers(baseMaps, overlayMaps, { position: 'topright' }).addTo(map);

    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
    
    const NorthArrowControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-control-north-arrow');
            container.innerHTML = `
                <svg id="north-arrow-svg" width="30" height="40" viewBox="0 0 30 40">
                    <path d="M 15 0 L 30 25 L 15 20 L 0 25 Z" fill="black"></path>
                    <text x="9" y="18" font-size="16" font-weight="bold" fill="white">N</text>
                </svg>
            `;
            return container;
        }
    });
    map.addControl(new NorthArrowControl());
    
    const FollowControl = L.Control.extend({
        options: { position: 'bottomright' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.innerHTML = `<a id="follow-user-btn" href="#" title="現在地に追従" class="leaflet-control-custom-btn"><i class="fas fa-location-crosshairs"></i></a>`;
            L.DomEvent.disableClickPropagation(container);
            return container;
        }
    });
    map.addControl(new FollowControl());

    const FullscreenControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.innerHTML = `<a id="fullscreen-btn" href="#" title="全画面表示" class="leaflet-control-custom-btn"><i class="fas fa-expand"></i></a>`;
            L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation)
                      .on(container, 'click', L.DomEvent.preventDefault)
                      .on(container, 'click', toggleFullscreen);
            return container;
        }
    });
    map.addControl(new FullscreenControl());
    
    const OrientationControl = L.Control.extend({
        options: { position: 'topleft' },
        onAdd: function (map) {
            const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
            container.innerHTML = `<a id="orientation-toggle-btn" href="#" title="北を上に固定中 (進行方向固定に切替)" class="leaflet-control-custom-btn"><i class="fas fa-compass"></i></a>`;
            L.DomEvent.on(container, 'click', L.DomEvent.stopPropagation)
                      .on(container, 'click', L.DomEvent.preventDefault)
                      .on(container, 'click', toggleOrientationMode);
            return container;
        }
    });
    map.addControl(new OrientationControl());

    const userIconHTML = `<div class="user-location-marker-rotator"><svg viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z"/></svg></div>`;
    const userIcon = L.divIcon({
        html: userIconHTML,
        className: 'user-location-marker',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });
    currentUserMarker = L.marker([0, 0], { icon: userIcon, pane: 'markerPane' }).addTo(map);
}


/**
 * マップの回転を制御する
 */
function updateMapRotation() {
    if (!currentPosition || !currentUserMarker || !currentUserMarker._icon) return;

    const mapPane = map.getPane('mapPane');
    const northArrow = document.getElementById('north-arrow-svg');
    const rotator = currentUserMarker._icon.querySelector('.user-location-marker-rotator');

    let mapRotation = 0;
    let markerRotation = 0;
    
    const effectiveHeading = (currentUserCourse !== null && !isNaN(currentUserCourse)) ? currentUserCourse : currentHeading;

    if (mapOrientationMode === 'north-up') {
        mapRotation = 0;
        markerRotation = effectiveHeading;
    } else { // 'course-up'
        mapRotation = window.isFollowingUser ? -effectiveHeading : 0;
        markerRotation = window.isFollowingUser ? 0 : effectiveHeading;
    }
    
    mapPane.style.transform = `rotate(${mapRotation}deg)`;
    rotator.style.transform = `rotate(${markerRotation}deg)`;
    northArrow.style.transform = `rotate(${-mapRotation}deg)`;
}
