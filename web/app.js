import { cacheDom, dom } from './modules/dom.js';
import { appState } from './modules/state.js';
import { initConfig } from './modules/api.js';
import { initAuth, handleSignOut, updateUserBadge } from './modules/auth.js';
import {
  initScannerSupport,
  openScannerSheet,
  closeScannerSheet,
  startScanner,
  stopScanner,
  toggleTorch
} from './modules/scanner.js';
import { openRoomSheet, closeRoomSheet, populateRooms } from './modules/rooms.js';
import { handleImageFileChange, clearSelectedImage } from './modules/images.js';
import { loadOfflineQueue, updateOfflineBadge, syncOfflineQueue } from './modules/offline.js';
import {
  setFilterText,
  refreshEntriesFromServer,
  handleEntriesListClick,
  applyFilterAndRender,
  updateAdminUI,
  setAdminMode
} from './modules/entries.js';
import { saveCurrentItem, clearForm, adjustQuantity, setQuantityValue } from './modules/items.js';
import { handleLayoutChange } from './modules/layout.js';
import { debounce } from './modules/utils.js';

function bindEvents() {
  dom.tabScan.onclick = function () { switchTab('scan'); };
  dom.tabEntries.onclick = function () { switchTab('entries'); };
  if (dom.btnSignOut) {
    dom.btnSignOut.onclick = function () { handleSignOut(); };
  }

  dom.btnStopScan.onclick = function () {
    if (appState.scanning) {
      stopScanner();
    } else {
      startScanner();
    }
  };
  dom.btnToggleTorch.onclick = function () { toggleTorch(); };
  dom.continuousToggle.onchange = function () {
    appState.continuousScanning = !!dom.continuousToggle.checked;
  };
  if (dom.cameraSelect) {
    dom.cameraSelect.onchange = function () {
      appState.selectedCameraId = dom.cameraSelect.value || '';
      if (appState.scanning) {
        stopScanner();
        startScanner();
      }
    };
  }

  dom.btnOpenScanner.onclick = function () {
    openScannerSheet();
  };

  dom.btnCloseScannerSheet.onclick = function () { closeScannerSheet(); };
  dom.scannerSheetBackdrop.onclick = function () { closeScannerSheet(); };
  document.addEventListener('keydown', function (evt) {
    if (evt.key === 'Escape') {
      closeScannerSheet();
      closeRoomSheet();
    }
  });

  dom.btnOpenRoomSheet.onclick = openRoomSheet;
  dom.btnCloseRoomSheet.onclick = closeRoomSheet;
  dom.roomSheetBackdrop.onclick = closeRoomSheet;

  dom.itemForm.onsubmit = function (e) {
    if (e && e.preventDefault) { e.preventDefault(); }
    saveCurrentItem();
    return false;
  };

  dom.btnClearForm.onclick = function () { clearForm(); };

  dom.takePhotoButton.onclick = function () {
    if (dom.takePhotoInput) { dom.takePhotoInput.click(); }
  };
  dom.choosePhotoButton.onclick = function () {
    if (dom.choosePhotoInput) { dom.choosePhotoInput.click(); }
  };
  dom.takePhotoInput.onchange = handleImageFileChange;
  dom.choosePhotoInput.onchange = handleImageFileChange;
  dom.removeImageButton.onclick = function () { clearSelectedImage(); };

  if (dom.btnQtyMinus) {
    dom.btnQtyMinus.onclick = function () { adjustQuantity(-1); };
  }
  if (dom.btnQtyPlus) {
    dom.btnQtyPlus.onclick = function () { adjustQuantity(1); };
  }
  if (dom.inputQuantity) {
    dom.inputQuantity.onchange = function () { setQuantityValue(dom.inputQuantity.value); };
  }

  dom.btnSyncScan.onclick = function () { syncOfflineQueue(); };
  dom.btnSyncEntries.onclick = function () { syncOfflineQueue(); };

  window.addEventListener('online', function () { syncOfflineQueue(); });
  window.addEventListener('focus', function () { syncOfflineQueue(); });
  window.addEventListener('pagehide', function () {
    stopScanner();
    closeScannerSheet({ skipFocus: true });
  });
  window.addEventListener('resize', debounce(handleLayoutChange, 120));

  dom.searchInput.oninput = function () {
    setFilterText(dom.searchInput.value || '');
  };
  dom.btnRefreshEntries.onclick = function () { refreshEntriesFromServer(); };
  if (dom.adminModeToggle) {
    dom.adminModeToggle.onchange = function () {
      setAdminMode(dom.adminModeToggle.checked);
    };
  }
  dom.entriesList.onclick = handleEntriesListClick;
}

function switchTab(tabName) {
  if (tabName === 'entries') {
    dom.screenScan.classList.remove('screen-active');
    dom.screenEntries.classList.add('screen-active');
    dom.tabScan.classList.remove('tab-active');
    dom.tabEntries.classList.add('tab-active');
    if (appState.scanning) { stopScanner(); }
    closeScannerSheet({ skipFocus: true });
  } else {
    dom.screenEntries.classList.remove('screen-active');
    dom.screenScan.classList.add('screen-active');
    dom.tabEntries.classList.remove('tab-active');
    dom.tabScan.classList.add('tab-active');
  }
}

function handleInitialData(data) {
  data = data || {};
  appState.userEmail = data.userEmail || '';
  appState.isAdmin = !!data.isAdmin;
  appState.entries = data.entries || [];
  appState.filterText = '';
  appState.editingEntryId = null;

  populateRooms(data.rooms || []);
  updateUserBadge();
  updateAdminUI();
  applyFilterAndRender();
}

function syncOnSignedIn() {
  if (appState.offlineQueue && appState.offlineQueue.length) {
    syncOfflineQueue();
  }
}

function initApp() {
  cacheDom();
  bindEvents();
  initConfig();
  handleLayoutChange();
  initScannerSupport();
  loadOfflineQueue();
  updateOfflineBadge();
  switchTab('scan');
  initAuth({
    onInitialData: handleInitialData,
    onSignedIn: syncOnSignedIn
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
