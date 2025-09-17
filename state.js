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
let currentMode = 'acquire'; // 'acquire' or 'navigate'
let indexToDelete = null; // 削除対象のインデックスを保持
let manualInputMode = 'latlon'; // 'latlon' or 'xy'

// ★★★ 新規追加: アプリケーションの状態を一元管理 ★★★
const appState = {
    followUser: true, // 現在地追従モードの状態
    headingUp: false // ヘディングアップモードの状態
};

// --- 削除済: 古いグローバル変数 (appStateに移行) ---
// window.isFollowingUser
// let mapOrientationMode

let isResizing = false;
let currentHeading = 0; // デバイスの向き（コンパス）
let currentUserCourse = null; // GPSによる進行方向
let currentGnssStatus = '---'; // GNSSステータスを保持
let isBearingInverted = false; // 船首方位の反転状態

// --- デバッグ用グローバル変数 ---
let lastDrawnMarkerAngle = null; // 最後にマーカー描画に使われた角度
let mapRotationAngle = 0; // 地図の回転角 (現在は未使用)
let lastRawHeading = null; // センサーから取得した生のコンパス値（磁北基準）

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
    followUserBtn: null, // 後で設定
    fullscreenInfoPanel: document.getElementById('fullscreen-info-panel'),
    fullscreenNavInfo: document.getElementById('fullscreen-nav-info'),
    fullscreenLat: document.getElementById('fullscreen-lat'),
    fullscreenLon: document.getElementById('fullscreen-lon'),
    fullscreenAcc: document.getElementById('fullscreen-acc'),
    fullscreenGnssStatus: document.getElementById('fullscreen-gnss-status'),
    fullscreenDistance: document.getElementById('fullscreen-distance'),
    fullscreenBearingText: document.getElementById('fullscreen-bearing-text'),
    fullscreenRelativeBearing: document.getElementById('fullscreen-relative-bearing'),
};



