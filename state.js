/**
 * state.js
 * アプリケーションの全体状態を管理し、状態変更のログを一元的に出力する。
 */

// --- グローバル変数 ---
let map, watchId;
let currentPosition = null;
let currentUserMarker = null;
let targetMarker = null;
let targetCircle = null;
let navLine = null;
let recordedPoints = [];
let importedPoints = [];
let tempCoordsForModal = null;
let currentMode = 'acquire';
let indexToDelete = null;
let manualInputMode = 'latlon';

// --- アプリケーションの状態を一元管理 ---
const appState = {
    followUser: true,
    headingUp: false,
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
 * 方位情報の状態を更新し、ログを出力する
 * @param {number | null} newValue - 新しい方位角
 * @param {string | null} reason - valueがnullの場合の理由
 */
function updateHeadingState(newValue, reason) {
    appState.heading.value = newValue;
    appState.heading.reason = reason;

    const eventName = newValue !== null ? 'heading_update' : 'heading_null';
    logJSON('state.js', eventName, appState.heading);
    
    // mapControllerに状態を渡して地図（マーカー）の更新を依頼
    updateMapRotation(appState.heading);
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
    orientationToggleBtn: null,
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
};
