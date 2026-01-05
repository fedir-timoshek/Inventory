export var dom = {};

export function $(id) {
  return document.getElementById(id);
}

export function cacheDom() {
  dom.tabScan = $('tabScan');
  dom.tabEntries = $('tabEntries');
  dom.screenScan = $('screenScan');
  dom.screenEntries = $('screenEntries');
  dom.userBadge = $('userBadge');
  dom.btnSignOut = $('btnSignOut');
  dom.authScreen = $('authScreen');
  dom.loadingScreen = $('loadingScreen');
  dom.loadingStatus = $('loadingStatus');
  dom.googleSignInButton = $('googleSignInButton');
  dom.authError = $('authError');

  dom.videoShell = $('videoShell');
  dom.video = $('videoPreview');
  dom.scanStatus = $('scanStatus');
  dom.scanStatusBadge = $('scanStatusBadge');
  dom.cameraSupportMessage = $('cameraSupportMessage');
  dom.cameraSelectRow = $('cameraSelectRow');
  dom.cameraSelect = $('cameraSelect');
  dom.continuousToggle = $('continuousToggle');
  dom.btnStopScan = $('btnStopScan');
  dom.torchRow = $('torchRow');
  dom.btnToggleTorch = $('btnToggleTorch');
  dom.torchHint = $('torchHint');

  dom.itemForm = $('itemForm');
  dom.inputBarcode = $('inputBarcode');
  dom.btnOpenScanner = $('btnOpenScanner');
  dom.selectRoom = $('selectRoom');
  dom.roomDisplay = $('roomDisplay');
  dom.btnOpenRoomSheet = $('btnOpenRoomSheet');
  dom.inputNotes = $('inputNotes');

  dom.takePhotoButton = $('takePhotoButton');
  dom.choosePhotoButton = $('choosePhotoButton');
  dom.takePhotoInput = $('takePhotoInput');
  dom.choosePhotoInput = $('choosePhotoInput');
  dom.imagePreview = $('imagePreview');
  dom.removeImageButton = $('removeImageButton');
  dom.imagePlaceholder = $('imagePlaceholder');

  dom.btnSaveItem = $('btnSaveItem');
  dom.btnClearForm = $('btnClearForm');
  dom.btnSyncScan = $('btnSyncScan');

  dom.offlineBadge = $('offlineBadge');
  dom.offlineBadgeCount = $('offlineBadgeCount');

  dom.searchInput = $('searchInput');
  dom.btnRefreshEntries = $('btnRefreshEntries');
  dom.btnSyncEntries = $('btnSyncEntries');
  dom.entriesList = $('entriesList');
  dom.adminBar = $('adminBar');
  dom.adminModeToggle = $('adminModeToggle');

  dom.scannerSheet = $('scannerSheet');
  dom.scannerSheetBackdrop = $('scannerSheetBackdrop');
  dom.btnCloseScannerSheet = $('btnCloseScannerSheet');

  dom.roomSheet = $('roomSheet');
  dom.roomSheetBackdrop = $('roomSheetBackdrop');
  dom.btnCloseRoomSheet = $('btnCloseRoomSheet');
  dom.roomList = $('roomList');

  dom.toastContainer = $('toastContainer');
}
