import { appState } from './state.js';
import { dom } from './dom.js';
import { callApi, hasServer } from './api.js';
import { ensureAuth } from './auth.js';
import { showToast } from './toast.js';
import { enqueueOfflineEntry } from './offline.js';
import { applyFilterAndRender } from './entries.js';
import { clearSelectedImage } from './images.js';
import { triggerVibrate } from './utils.js';

export function clearForm() {
  dom.inputBarcode.value = '';
  dom.inputNotes.value = '';
  dom.selectRoom.value = '';
  dom.roomDisplay.textContent = 'Select a room';
  clearSelectedImage();
  dom.inputBarcode.focus();
}

export function saveCurrentItem() {
  if (!ensureAuth()) { return; }
  var barcode = (dom.inputBarcode.value || '').toString().trim();
  var room = (dom.selectRoom.value || '').toString().trim();
  var notes = (dom.inputNotes.value || '').toString().trim();

  if (!barcode) {
    showToast('Please scan or type a barcode.', 'error');
    dom.inputBarcode.focus();
    return;
  }
  if (!room) {
    showToast('Please choose a room / location.', 'error');
    if (dom.btnOpenRoomSheet && dom.btnOpenRoomSheet.focus) {
      dom.btnOpenRoomSheet.focus();
    }
    return;
  }

  var payload = {
    barcode: barcode,
    room: room,
    notes: notes,
    imageDataUrl: appState.selectedImageDataUrl || ''
  };
  if (!hasServer()) {
    showToast('Cannot save without API access.', 'error');
    return;
  }

  dom.btnSaveItem.disabled = true;
  dom.btnSaveItem.textContent = 'Saving…';

  callApi('saveEntry', appState.authToken, payload)
    .then(function (entry) {
      dom.btnSaveItem.disabled = false;
      dom.btnSaveItem.textContent = '💾 Save item';
      showToast('Item saved.', 'success');
      triggerVibrate(60);
      if (entry && entry.id) {
        appState.entries.unshift(entry);
        applyFilterAndRender();
      }
      dom.inputBarcode.value = '';
      dom.inputNotes.value = '';
      clearSelectedImage();
    })
    .catch(function () {
      dom.btnSaveItem.disabled = false;
      dom.btnSaveItem.textContent = '💾 Save item';
      enqueueOfflineEntry(payload);
      showToast('Saved locally; will sync when back online.', 'info');
    });
}
