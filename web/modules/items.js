import { appState } from './state.js';
import { dom } from './dom.js';
import { callApi, hasServer } from './api.js';
import { ensureAuth } from './auth.js';
import { showToast } from './toast.js';
import { enqueueOfflineEntry } from './offline.js';
import { applyFilterAndRender } from './entries.js';
import { clearSelectedImage } from './images.js';
import { generateUuid, triggerVibrate } from './utils.js';

export function clearForm() {
  dom.inputBarcode.value = '';
  dom.inputNotes.value = '';
  setQuantityValue(1);
  dom.selectRoom.value = '';
  dom.roomDisplay.textContent = 'Select a room';
  clearSelectedImage();
  dom.inputBarcode.focus();
}

export function adjustQuantity(delta) {
  return setQuantityValue(getQuantityValue() + delta);
}

export function setQuantityValue(value) {
  if (!dom.inputQuantity) { return 1; }
  var next = parseInt(value, 10);
  if (!next || next < 1) { next = 1; }
  dom.inputQuantity.value = String(next);
  return next;
}

function getQuantityValue() {
  if (!dom.inputQuantity) { return 1; }
  return setQuantityValue(dom.inputQuantity.value);
}

export function saveCurrentItem() {
  if (!ensureAuth()) { return; }
  if (appState.imageProcessing) {
    showToast('Please wait for the image to finish processing.', 'info');
    return;
  }
  var barcode = (dom.inputBarcode.value || '').toString().trim();
  var room = (dom.selectRoom.value || '').toString().trim();
  var notes = (dom.inputNotes.value || '').toString().trim();
  var quantity = getQuantityValue();
  var imageDataUrl = appState.selectedImageDataUrl || '';
  var clientEntryId = generateUuid();

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
    quantity: quantity,
    clientEntryId: clientEntryId
  };
  var offlinePayload = {
    barcode: barcode,
    room: room,
    notes: notes,
    quantity: quantity,
    imageDataUrl: imageDataUrl,
    clientEntryId: clientEntryId
  };
  if (!hasServer()) {
    showToast('Cannot save without API access.', 'error');
    return;
  }

  dom.btnSaveItem.disabled = true;
  dom.btnSaveItem.textContent = 'Saving…';

  callApi('saveEntry', appState.authToken, payload, { timeoutMs: 15000 })
    .then(function (entry) {
      dom.btnSaveItem.disabled = false;
      dom.btnSaveItem.textContent = '💾 Save item';
      showToast('Item saved.', 'success');
      triggerVibrate(60);
      if (entry && entry.id) {
        appState.entries.unshift(entry);
        applyFilterAndRender();
      }
      if (entry && entry.id && imageDataUrl) {
        uploadEntryImage(entry.id, imageDataUrl, offlinePayload);
      }
      dom.inputBarcode.value = '';
      dom.inputNotes.value = '';
      setQuantityValue(1);
      clearSelectedImage();
    })
    .catch(function (err) {
      dom.btnSaveItem.disabled = false;
      dom.btnSaveItem.textContent = '💾 Save item';
      if (shouldQueueNetworkError(err)) {
        enqueueOfflineEntry(offlinePayload);
        showToast('Saved locally; will sync when back online.', 'info');
        dom.inputBarcode.value = '';
        dom.inputNotes.value = '';
        setQuantityValue(1);
        clearSelectedImage();
      } else {
        showToast('Save failed. ' + (err && err.message ? err.message : ''), 'error');
      }
    });
}

function uploadEntryImage(entryId, imageDataUrl, fallbackPayload) {
  if (!entryId || !imageDataUrl) { return; }
  showToast('Uploading photo...', 'info');
  callApi('uploadEntryImage', appState.authToken, {
    id: entryId,
    imageDataUrl: imageDataUrl
  }, { timeoutMs: 20000 })
    .then(function (updatedEntry) {
      if (updatedEntry && updatedEntry.id) {
        updateEntryImageInState(updatedEntry);
      }
      showToast('Photo uploaded.', 'success');
    })
    .catch(function (err) {
      console.log('uploadEntryImage error:', err);
      if (shouldQueueNetworkError(err) && fallbackPayload) {
        enqueueOfflineEntry(fallbackPayload);
        showToast('Photo queued; will sync when online.', 'info');
      } else {
        showToast('Photo upload failed. Try again later.', 'error');
      }
    });
}

function updateEntryImageInState(updatedEntry) {
  if (!updatedEntry || !updatedEntry.id) { return; }
  var entries = appState.entries || [];
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].id === updatedEntry.id) {
      entries[i].imageUrl = updatedEntry.imageUrl || '';
      applyFilterAndRender();
      return;
    }
  }
}

function shouldQueueNetworkError(err) {
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return true;
    }
  } catch (e) {}
  if (!err) { return true; }
  if (err.isNetworkError) { return true; }
  if (typeof err.status !== 'number') { return true; }
  if (typeof err.status === 'number') {
    if (err.status === 0) { return true; }
    if (err.status >= 500) { return true; }
    if (err.status === 408) { return true; }
  }
  if (err.name === 'AbortError') { return true; }
  if (err.name === 'TypeError') { return true; }
  var message = (err.message || '').toLowerCase();
  if (!message) { return true; }
  if (message.indexOf('timed out') > -1) { return true; }
  if (message.indexOf('failed to fetch') > -1) { return true; }
  if (message.indexOf('load failed') > -1) { return true; }
  if (message.indexOf('fetch failed') > -1) { return true; }
  if (message.indexOf('networkerror') > -1) { return true; }
  if (message.indexOf('network') > -1) { return true; }
  return false;
}
