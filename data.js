const JGD2011_SYSTEMS = {
    1: { name: "I系 (長崎, 鹿児島(島嶼))", epsg: "EPSG:6669" },
    2: { name: "II系 (福岡, 佐賀, 熊本, 大分, 宮崎, 鹿児島)", epsg: "EPSG:6670" },
    3: { name: "III系 (山口, 島根, 広島)", epsg: "EPSG:6671" },
    4: { name: "IV系 (香川, 愛媛, 高知, 徳島)", epsg: "EPSG:6672" },
    5: { name: "V系 (兵庫, 鳥取, 岡山)", epsg: "EPSG:6673" },
    6: { name: "VI系 (京都, 大阪, 福井, 滋賀, 三重, 奈良, 和歌山)", epsg: "EPSG:6674" },
    7: { name: "VII系 (石川, 富山, 岐阜, 愛知)", epsg: "EPSG:6675" },
    8: { name: "VIII系 (新潟, 長野, 山梨, 静岡)", epsg: "EPSG:6676" },
    9: { name: "IX系 (東京(本土), 埼玉, 群馬, 栃木, 茨城, 千葉, 神奈川)", epsg: "EPSG:6677" },
    10: { name: "X系 (青森, 秋田, 山形, 岩手, 宮城, 福島)", epsg: "EPSG:6678" },
    11: { name: "XI系 (北海道(南西))", epsg: "EPSG:6679" },
    12: { name: "XII系 (北海道(中央))", epsg: "EPSG:6680" },
    13: { name: "XIII系 (北海道(東))", epsg: "EPSG:6681" },
    14: { name: "XIV系 (東京(小笠原))", epsg: "EPSG:6682" },
    15: { name: "XV系 (沖縄)", epsg: "EPSG:6683" },
    16: { name: "XVI系 (沖縄(先島))", epsg: "EPSG:6684" },
    17: { name: "XVII系 (沖縄(大東))", epsg: "EPSG:6685" },
    18: { name: "XVIII系 (東京(沖ノ鳥島))", epsg: "EPSG:6686" },
    19: { name: "XIX系 (東京(南鳥島))", epsg: "EPSG:6687" },
};

function initializeCoordSystemDefinitions() {
    proj4.defs([
        ['EPSG:6669', '+proj=tmerc +lat_0=33 +lon_0=129.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6670', '+proj=tmerc +lat_0=33 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6671', '+proj=tmerc +lat_0=36 +lon_0=132.1666666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6672', '+proj=tmerc +lat_0=33 +lon_0=133.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6673', '+proj=tmerc +lat_0=36 +lon_0=134.3333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6674', '+proj=tmerc +lat_0=36 +lon_0=136 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6675', '+proj=tmerc +lat_0=36 +lon_0=137.1666666666667 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6676', '+proj=tmerc +lat_0=36 +lon_0=138.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6677', '+proj=tmerc +lat_0=36 +lon_0=139.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6678', '+proj=tmerc +lat_0=40 +lon_0=140.8333333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6679', '+proj=tmerc +lat_0=44 +lon_0=140.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6680', '+proj=tmerc +lat_0=44 +lon_0=142.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6681', '+proj=tmerc +lat_0=44 +lon_0=144.25 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6682', '+proj=tmerc +lat_0=26 +lon_0=142 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6683', '+proj=tmerc +lat_0=26 +lon_0=127.5 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6684', '+proj=tmerc +lat_0=26 +lon_0=124 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6685', '+proj=tmerc +lat_0=26 +lon_0=131 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6686', '+proj=tmerc +lat_0=20.41666666666667 +lon_0=136.0833333333333 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs'],
        ['EPSG:6687', '+proj=tmerc +lat_0=24.25 +lon_0=154 +k=0.9999 +x_0=0 +y_0=0 +ellps=GRS80 +units=m +no_defs']
    ]);
}

function initializeCoordSystemSelector() {
    for (const key in JGD2011_SYSTEMS) {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = JGD2011_SYSTEMS[key].name;
        dom.exportCoordSystemSelect.appendChild(option.cloneNode(true));
        dom.importCoordSystemSelect.appendChild(option.cloneNode(true));
        dom.manualXyCoordSystemSelect.appendChild(option.cloneNode(true));
        dom.currentCoordSystemSelect.appendChild(option.cloneNode(true));
    }
}

function convertToXY(lat, lon, zoneKey) {
    const fromCRS = 'EPSG:4326'; // WGS 84
    const toCRS = JGD2011_SYSTEMS[zoneKey].epsg;
    const converted = proj4(fromCRS, toCRS, [lon, lat]);
    return { x: converted[1], y: converted[0] };
}

function convertToLatLon(northing, easting, zoneKey) {
    const fromCRS = JGD2011_SYSTEMS[zoneKey].epsg;
    const toCRS = 'EPSG:4326'; // WGS 84
    const converted = proj4(fromCRS, toCRS, [easting, northing]);
    return { lon: converted[0], lat: converted[1] };
}

function exportToCSV() {
    const selectedZone = dom.exportCoordSystemSelect.value;
    let csvContent = '\uFEFF';
    csvContent += "測点名,緯度,経度,X座標(m),Y座標(m),精度(m),GNSSステータス,測地系,タイムスタンプ\r\n";
    recordedPoints.forEach(p => {
        const xy = convertToXY(p.lat, p.lon, selectedZone);
        const name = `"${p.name.replace(/"/g, '""')}"`;
        csvContent += `${name},${p.lat},${p.lon},${xy.x.toFixed(4)},${xy.y.toFixed(4)},${p.acc.toFixed(2)},${p.status},${JGD2011_SYSTEMS[selectedZone].name},${p.timestamp}\r\n`;
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "survey_points.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function handleFileImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const text = e.target.result;
        const selectedZone = dom.importCoordSystemSelect.value;
        importedPoints.forEach(p => map.removeLayer(p.marker));
        importedPoints = [];

        const rows = text.split(/\r?\n/);
        if (rows.length > 0 && (rows[0].includes('測点名') || rows[0].includes('Y座標'))) {
            rows.shift();
        }

        rows.forEach(row => {
            if (row.trim() === '') return;
            const cols = row.split(',');
            if (cols.length >= 3) {
                const name = cols[0].replace(/"/g, '');
                const easting = parseFloat(cols[1]);
                const northing = parseFloat(cols[2]);
                if (!isNaN(northing) && !isNaN(easting)) {
                    const latLon = convertToLatLon(northing, easting, selectedZone);
                    const marker = L.marker([latLon.lat, latLon.lon], {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-orange.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                            iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
                        })
                    }).addTo(map).bindPopup(`<b>${name}</b> (インポート)`);
                    
                    importedPoints.push({ name, lat: latLon.lat, lon: latLon.lon, marker, isVisible: true });
                }
            }
        });
        updateImportedPointList();
    };
    reader.readAsText(file);
    dom.csvFileInput.value = '';
}

function saveData() {
    try {
        const dataToSave = recordedPoints.map(p => ({
            name: p.name,
            lat: p.lat,
            lon: p.lon,
            acc: p.acc,
            status: p.status,
            timestamp: p.timestamp,
            isVisible: p.isVisible
        }));
        localStorage.setItem('umineko_recordedPoints', JSON.stringify(dataToSave));
    } catch(e) {
        console.error("データの保存に失敗しました:", e);
        alert("データの保存に失敗しました。ストレージの空き容量が不足している可能性があります。");
    }
}

function loadData() {
    const savedData = localStorage.getItem('umineko_recordedPoints');
    if (savedData) {
        try {
            const parsedData = JSON.parse(savedData);
            recordedPoints = parsedData.map(p => {
                const marker = L.marker([p.lat, p.lon])
                    .bindPopup(`<b>${p.name}</b><br>緯度: ${p.lat.toFixed(6)}<br>経度: ${p.lon.toFixed(6)}`);
                const isVisible = p.isVisible !== false;
                if (isVisible) {
                    marker.addTo(map);
                }
                return { ...p, marker, isVisible };
            });
            updatePointList();
        } catch (e) {
            console.error("保存されたデータの読み込みに失敗しました:", e);
            localStorage.removeItem('umineko_recordedPoints');
        }
    }
}

function deleteAllData() {
    recordedPoints.forEach(p => map.removeLayer(p.marker));
    importedPoints.forEach(p => map.removeLayer(p.marker));
    recordedPoints = [];
    importedPoints = [];
    localStorage.removeItem('umineko_recordedPoints');
    updatePointList();
    updateImportedPointList();
    dom.deleteAllConfirmModal.classList.remove('is-open');
    alert("すべてのデータを削除しました。");
}

function handleRecordPoint() {
    if (!currentPosition) {
        alert("現在地が特定できていません。");
        return;
    }
    tempCoordsForModal = { lat: currentPosition.coords.latitude, lon: currentPosition.coords.longitude, acc: currentPosition.coords.accuracy, status: currentGnssStatus };
    dom.pointNameInput.value = `ポイント ${recordedPoints.length + 1}`;
    dom.pointNameModal.classList.add('is-open');
    dom.pointNameInput.focus();
    dom.pointNameInput.select();
}

function savePointName() {
    const name = dom.pointNameInput.value.trim() || '名称未設定';
    const marker = L.marker([tempCoordsForModal.lat, tempCoordsForModal.lon])
        .addTo(map)
        .bindPopup(`<b>${name}</b><br>緯度: ${tempCoordsForModal.lat.toFixed(6)}<br>経度: ${tempCoordsForModal.lon.toFixed(6)}`);
    const point = {
        name: name,
        lat: tempCoordsForModal.lat,
        lon: tempCoordsForModal.lon,
        acc: tempCoordsForModal.acc,
        status: tempCoordsForModal.status,
        timestamp: new Date().toISOString(),
        marker: marker,
        isVisible: true 
    };
    recordedPoints.push(point);
    updatePointList();
    saveData();
    dom.pointNameModal.classList.remove('is-open');
}

function togglePointVisibility(index, type) {
    const pointArray = (type === 'recorded') ? recordedPoints : importedPoints;
    const point = pointArray[index];
    if (!point) return;

    point.isVisible = !point.isVisible; 

    if (point.isVisible) {
        point.marker.addTo(map);
    } else {
        map.removeLayer(point.marker);
    }

    if (type === 'recorded') {
        updatePointList();
    } else {
        updateImportedPointList();
    }
    saveData();
}

function handleSetTargetManual() {
    if (manualInputMode === 'latlon') {
        const lat = parseFloat(dom.targetLatInput.value);
        const lon = parseFloat(dom.targetLonInput.value);
        if (isNaN(lat) || isNaN(lon)) {
            alert("有効な緯度と経度を入力してください。");
            return;
        }
        handleSetTarget({lat, lon});
    } else { // xy mode
        const easting = parseFloat(dom.targetYInput.value);
        const northing = parseFloat(dom.targetXInput.value);
        const zone = dom.manualXyCoordSystemSelect.value;
        if (isNaN(northing) || isNaN(easting)) {
            alert("有効なXY座標を入力してください。");
            return;
        }
        const latLon = convertToLatLon(northing, easting, zone);
        handleSetTarget({lat: latLon.lat, lon: latLon.lon});
    }
}

function handleSetTargetFromImport(point) {
    dom.targetLatInput.value = point.lat;
    dom.targetLonInput.value = point.lon;
    handleSetTarget(point);
}

function handleSetTarget(point) {
    const targetLatLng = [point.lat, point.lon];
    if (!targetMarker) {
        targetMarker = L.marker(targetLatLng, {
            icon: L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
            })
        }).addTo(map).bindPopup("目標地点");
        targetCircle = L.circle(targetLatLng, { radius: 1, color: 'red', weight: 2, fillOpacity: 0.1 }).addTo(map);
    } else {
        targetMarker.setLatLng(targetLatLng);
        targetCircle.setLatLng(targetLatLng);
    }
    if(currentUserMarker.getLatLng().lat !== 0) {
        map.fitBounds([currentUserMarker.getLatLng(), targetLatLng], { padding: [50, 50] });
    } else {
        map.setView(targetLatLng, 16);
    }
    dom.navigationInfo.classList.remove('hidden');
    dom.fullscreenNavInfo.classList.remove('hidden');
    updateNavigationInfo();
}

function updateNavigationInfo() {
    if (!currentPosition || !targetMarker) return;
    const from = currentUserMarker.getLatLng();
    const to = targetMarker.getLatLng();
    const distance = from.distanceTo(to);
    const bearing = calculateBearing(from.lat, from.lng, to.lat, to.lng);
    const direction = bearingToDirection(bearing);

    dom.distanceToTarget.textContent = `${distance.toFixed(2)} m`;
    dom.bearingArrow.style.transform = `rotate(${bearing}deg)`;
    dom.bearingText.textContent = direction;
    dom.fullscreenDistance.textContent = distance.toFixed(2);
    dom.fullscreenBearingText.textContent = direction;

    const latDiff = to.lat - from.lat;
    const lonDiff = to.lng - from.lng;
    const pointForNS = L.latLng(to.lat, from.lng);
    const pointForEW = L.latLng(from.lat, to.lng);
    const distNS = from.distanceTo(pointForNS);
    const distEW = from.distanceTo(pointForEW);
    const dirNS = latDiff >= 0 ? '北へ' : '南へ';
    const dirEW = lonDiff >= 0 ? '東へ' : '西へ';

    dom.northSouthInfo.textContent = `${dirNS} ${distNS.toFixed(2)} m`;
    dom.eastWestInfo.textContent = `${dirEW} ${distEW.toFixed(2)} m`;
    
    let adjustedHeading = isBearingInverted ? (currentHeading + 180) % 360 : currentHeading;
    let relativeBearing = bearing - adjustedHeading;
    if (relativeBearing > 180) { relativeBearing -= 360; }
    if (relativeBearing < -180) { relativeBearing += 360; }
    const side = relativeBearing >= 0 ? '右舷' : '左舷';
    const angle = Math.abs(relativeBearing).toFixed(0);
    dom.relativeBearingInfo.textContent = `${side} ${angle}°`;
    dom.fullscreenRelativeBearing.textContent = `${side} ${angle}°`;

    if (distance < 1) { dom.distanceToTarget.className = 'text-3xl font-bold text-green-600 my-1'; } 
    else if (distance < 5) { dom.distanceToTarget.className = 'text-3xl font-bold text-yellow-600 my-1'; } 
    else { dom.distanceToTarget.className = 'text-3xl font-bold text-indigo-600 my-1'; }
    if (!navLine) {
        navLine = L.polyline([from, to], { color: 'purple', dashArray: '5, 10' }).addTo(map);
    } else {
        navLine.setLatLngs([from, to]);
    }
}

function toggleBearingInversion() {
    isBearingInverted = !isBearingInverted;
    dom.invertBearingBtn.classList.toggle('text-blue-500', isBearingInverted);
    dom.invertBearingBtn.classList.toggle('text-gray-400', !isBearingInverted);
    updateNavigationInfo();
}

function clearNavigation() {
    if (targetMarker) map.removeLayer(targetMarker);
    if (targetCircle) map.removeLayer(targetCircle);
    if (navLine) map.removeLayer(navLine);
    targetMarker = null;
    targetCircle = null;
    navLine = null;
    dom.navigationInfo.classList.add('hidden');
    dom.fullscreenNavInfo.classList.add('hidden');
    dom.targetLatInput.value = '';
    dom.targetLonInput.value = '';
}

function calculateBearing(lat1, lon1, lat2, lon2) {
    const toRad = Math.PI / 180;
    const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
    const x = Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
              Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
    const brng = Math.atan2(y, x) * (180 / Math.PI);
    return (brng + 360) % 360;
}

function bearingToDirection(bearing) {
    const directions = ['北', '北北東', '北東', '東北東', '東', '東南東', '南東', '南南東', '南', '南南西', '南西', '西南西', '西', '西北西', '北西', '北北西'];
    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
}
