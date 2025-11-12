/**
 * state.js
 * アプリケーションの全体状態を管理し、状態変更のログを一元的に出力する。
 * 各モジュール間の処理のハブとなる。
 */

// --- グローバル変数 ---
let map, watchId;
// currentPositionはappStateで管理するように変更
let currentUserMarker = null; // マーカー実体は初回測位時にmapControllerで生成
let targetMarker = null;
let targetCircle = null;
let navLine = null;
let recordedPoints = [];
let importedPoints = [];
let tempCoordsForModal = null;
let currentMode = 'acquire';
let indexToDelete = null;
let manualInputMode = 'latlon';

// 【★追加】追従モードの閾値（メートル）
const RECENTER_THRESHOLDS = {
    normal: 15, // 通常モード (スマホGPS)
    survey: 1   // 測量モード (高精度GNSS)
};

// --- アプリケーションの状態を一元管理 ---
const appState = {
    position: null, // 現在の位置情報 (GeolocationPosition object)
    previousPosition: null, // 【★追加】前回の位置情報 (GeolocationPosition object)
    cumulativeDistance: 0, // 【★追加】累積移動距離 (メートル)
    // 【★修正】初期値を true に設定し、UIの初期状態と一致させる
    followUser: true,
    mode: 'north-up', // 'north-up' or 'heading-up'
    surveyMode: 'normal', // 【★追加】 'normal' or 'survey'
    lastSetViewLatLng: null, // 【★追加】 最後にsetViewした緯度経度
    markerAnchor: 'center', // 'center' or 'bottom-quarter' (回転の中心)
    debugEnabled: true,
    // 方位情報をオブジェクトで管理
    heading: {
        value: null, // 現在の方位角 (0-360)
        reason: 'unsupported' // nullの場合の理由
    }
};

let isResizing = false;
let currentUserCourse = null;
let currentGnssStatus = '---';
let isBearingInverted = false;
let lastDrawnMarkerAngle = null;
let lastDrawnMapAngle = null; // HeadingUp時の地図の累積回転角度
let lastMapHeading = null; // HeadingUp時の地図の最終適用方位
let lastRawHeading = null;
let compassInitialized = false;
let heartbeatTicks = 0;

/**
 * ログをJSON形式でコンソールに出力する共通関数
 * @param {string} module - ログ出力元のモジュール名
 * @param {string} event - イベント名
 * @param {object} data - 詳細データ
 */
function logJSON(module, event, data) {
    const logEntry = {
        ts: Date.now(),
        module: module,
        event: event,
        data: data
    };
    console.log(JSON.stringify(logEntry, null, 2));
}

/**
 * 位置情報の状態を更新し、ログを出力し、mapControllerに処理を依頼する
 * @param {GeolocationPosition} newPosition - Geolocation APIから取得した新しい位置情報
 */
function setPosition(newPosition) {
    // 【★修正】現在の位置を「前回」として保存
    appState.previousPosition = appState.position;
    // 【★修正】新しい位置を「現在」として更新
    appState.position = newPosition;

    // 【★修正】 要件1: lastSetViewLatLngが未設定(null)の場合、最初の測位位置で初期化する
    if (appState.lastSetViewLatLng === null && typeof L !== 'undefined' && L.latLng) {
        appState.lastSetViewLatLng = L.latLng(newPosition.coords.latitude, newPosition.coords.longitude);
        logJSON('state.js', 'lastSetViewLatLng_initialized', {
            lat: appState.lastSetViewLatLng.lat,
            lon: appState.lastSetViewLatLng.lng
        });
    }
    
    logJSON('state.js', 'position_set', {
        lat: newPosition.coords.latitude,
        lon: newPosition.coords.longitude,
        acc: newPosition.coords.accuracy,
        previous_lat: appState.previousPosition ? appState.previousPosition.coords.latitude : null
    });
    
    // mapControllerに状態を渡して地図（マーカー）の更新を依頼
    // 【★修正】前回の位置情報も渡す
    updatePosition(newPosition, appState.previousPosition);
}

/**
 * 方位情報の状態を更新し、ログを出力し、mapControllerに処理を依頼する
 * @param {number | null} newValue - 新しい方位角
 * @param {string | null} reason - valueがnullの場合の理由
 */
function setHeading(newValue, reason) {
    const isChanged = appState.heading.value !== newValue || appState.heading.reason !== reason;
    if (!isChanged) return; // 状態が同じなら何もしない

    appState.heading.value = newValue;
    appState.heading.reason = reason;

    const eventName = newValue !== null ? 'heading_set' : 'heading_null';
    logJSON('state.js', eventName, { value: appState.heading.value, reason: appState.heading.reason });
    
    // mapControllerに状態を渡して地図（マーカー）の更新を依頼
    updateHeading(appState.heading);
}

/**
 * 表示モード（North-Up/Heading-Up）を変更する
 * @param {string} newMode - 'north-up' または 'heading-up'
 */
function setMode(newMode) {
    const oldMode = appState.mode;
    if (oldMode === newMode) return;

    appState.mode = newMode;
    logJSON('state.js', 'mode_changed', { from: oldMode, to: newMode });
    
    updateModeUI();
    // 新しいモードに基づいてマーカーの回転を再評価
    updateHeading(appState.heading); 
}

/**
 * 【★追加】測量モード（閾値）を変更する
 * @param {string} newSurveyMode - 'normal' または 'survey'
 */
function setSurveyMode(newSurveyMode) {
    const oldMode = appState.surveyMode;
    if (oldMode === newSurveyMode) return;

    appState.surveyMode = newSurveyMode;
    logJSON('state.js', 'survey_mode_changed', { from: oldMode, to: newSurveyMode, threshold: RECENTER_THRESHOLDS[newSurveyMode] });
    
    // (UI更新は現状不要)
}

// --- DOM要素 ---
const dom = {
    map: document.getElementById('map'),
    controlsPanel: document.getElementById('controls-panel'),
    modeAcquireTab: document.getElementById('mode-acquire-tab'),
    modeNavigateTab: document.getElementById('mode-navigate-tab'),
    panelAcquire: document.getElementById('panel-acquire'),
    panelNavigate: document.getElementById('panel-navigate'),
    currentLat: document.getElementById('current-lat'),
    currentLon: document.getElementById('current-lon'),
    currentX: document.getElementById('current-x'),
    currentY: document.getElementById('current-y'),
    currentAcc: document.getElementById('current-acc'),
    gpsStatus: document.getElementById('gps-status'),
    gnssStatus: document.getElementById('gnss-status'),
    currentCoordSystemSelect: document.getElementById('current-coord-system-select'),
    recordPointBtn: document.getElementById('record-point-btn'),
    pointList: document.getElementById('point-list'),
    exportCoordSystemSelect: document.getElementById('export-coord-system-select'),
    exportCsvBtn: document.getElementById('export-csv-btn'),
    deleteAllBtn: document.getElementById('delete-all-btn'),
    importCoordSystemSelect: document.getElementById('import-coord-system-select'),
    importCsvBtn: document.getElementById('import-csv-btn'),
    csvFileInput: document.getElementById('csv-file-input'),
    importedPointList: document.getElementById('imported-point-list'),
    manualInputLatLonTab: document.getElementById('manual-input-latlon-tab'),
    manualInputXyTab: document.getElementById('manual-input-xy-tab'),
    manualInputLatLonPanel: document.getElementById('manual-input-latlon-panel'),
    manualInputXyPanel: document.getElementById('manual-input-xy-panel'),
    manualXyCoordSystemSelect: document.getElementById('manual-xy-coord-system-select'),
    targetYInput: document.getElementById('target-y-input'),
    targetXInput: document.getElementById('target-x-input'),
    targetLatInput: document.getElementById('target-lat-input'),
    targetLonInput: document.getElementById('target-lon-input'),
    setTargetBtn: document.getElementById('set-target-btn'),
    navigationInfo: document.getElementById('navigation-info'),
    distanceToTarget: document.getElementById('distance-to-target'),
    bearingArrow: document.getElementById('bearing-arrow'),
    bearingText: document.getElementById('bearing-text'),
    northSouthInfo: document.getElementById('north-south-info'),
    eastWestInfo: document.getElementById('east-west-info'),
    relativeBearingInfo: document.getElementById('relative-bearing-info'),
    invertBearingBtn: document.getElementById('invert-bearing-btn'),
    pointNameModal: document.getElementById('point-name-modal'),
    pointNameInput: document.getElementById('point-name-input'),
    suggestNameBtn: document.getElementById('suggest-name-btn'),
    cancelPointNameBtn: document.getElementById('cancel-point-name'),
    savePointNameBtn: document.getElementById('save-point-name'),
    deleteConfirmModal: document.getElementById('delete-confirm-modal'),
    deleteConfirmText: document.getElementById('delete-confirm-text'),
    cancelDeleteBtn: document.getElementById('cancel-delete-btn'),
    confirmDeleteBtn: document.getElementById('confirm-delete-btn'),
    deleteAllConfirmModal: document.getElementById('delete-all-confirm-modal'),
    cancelDeleteAllBtn: document.getElementById('cancel-delete-all-btn'),
    confirmDeleteAllBtn: document.getElementById('confirm-delete-all-btn'),
    followUserBtn: null,
    fullscreenBtn: null,
    fullscreenInfoPanel: document.getElementById('fullscreen-info-panel'),
    fullscreenNavInfo: document.getElementById('fullscreen-nav-info'),
    fullscreenLat: document.getElementById('fullscreen-lat'),
    fullscreenLon: document.getElementById('fullscreen-lon'),
    fullscreenAcc: document.getElementById('fullscreen-acc'),
    fullscreenGnssStatus: document.getElementById('fullscreen-gnss-status'),
    fullscreenDistance: document.getElementById('fullscreen-distance'),
    fullscreenBearingText: document.getElementById('fullscreen-bearing-text'),
    fullscreenRelativeBearing: document.getElementById('fullscreen-relative-bearing'),
    debugPanel: null,
    modeDisplay: document.getElementById('mode-display'),
    modeSelector: null, // main.jsで設定
    surveyModeSelector: null, // 【★追加】 main.jsで設定
};