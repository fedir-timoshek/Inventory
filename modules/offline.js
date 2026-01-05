import { appState, OFFLINE_QUEUE_KEY } from './state.js';
import { dom } from './dom.js';
import { callApi, hasServer } from './api.js';
import { ensureAuth } from './auth.js';
import { showToast } from './toast.js';
import { refreshEntriesFromServer } from './entries.js';

export function loadOfflineQueue() {
  appState.offlineQueue = [];
  try {
    if (!window.localStorage) { return; }
    var raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) { return; }
    var parsed = JSON.parse(raw);
    if (parsed && parsed.splice) { appState.offlineQueue = parsed; }
  } catch (e) {
    appState.offlineQueue = [];
  } finally {
    updateOfflineBadge();
  }
}

export function enqueueOfflineEntry(payload) {
  var entry = {
    barcode: payload.barcode,
    room: payload.room,
    notes: payload.notes || '',
    imageDataUrl: payload.imageDataUrl || '',
    createdAt: new Date().toISOString()
  };
  if (!appState.offlineQueue) { appState.offlineQueue = []; }
  if (appState.offlineQueue.length >= 50) { appState.offlineQueue.shift(); }
  appState.offlineQueue.push(entry);
  saveOfflineQueue();
  updateOfflineBadge();
}

export function updateOfflineBadge() {
  var count = (appState.offlineQueue && appState.offlineQueue.length) ? appState.offlineQueue.length : 0;
  if (count > 0) {
    dom.offlineBadge.classList.remove('hidden');
    dom.offlineBadgeCount.textContent = String(count);
  } else {
    dom.offlineBadge.classList.add('hidden');
    dom.offlineBadgeCount.textContent = '0';
  }
}

export function syncOfflineQueue() {
  if (!hasServer() || !ensureAuth()) {
    showToast('Cannot sync queued items without API access.', 'error');
    return;
  }
  if (!appState.offlineQueue || !appState.offlineQueue.length) {
    showToast('No queued items to sync.', 'info');
    return;
  }
  var items = appState.offlineQueue.slice(0);
  var remaining = [];
  var index = 0;
  var successCount = 0;
  showToast('Syncing ' + items.length + ' queued item(s)…', 'info');
  function processNext() {
    if (index >= items.length) {
      appState.offlineQueue = remaining;
      saveOfflineQueue();
      updateOfflineBadge();
      if (successCount > 0) {
        showToast('Synced ' + successCount + ' item(s).', 'success');
        refreshEntriesFromServer();
      }
      return;
    }
    var item = items[index];
    index++;
    callApi('saveEntry', appState.authToken, item)
      .then(function () {
        successCount++;
        processNext();
      })
      .catch(function (err) {
        console.log('Failed to sync queued item:', err);
        remaining.push(item);
        processNext();
      });
  }
  processNext();
}

function saveOfflineQueue() {
  try {
    if (!window.localStorage) { return; }
    var json = JSON.stringify(appState.offlineQueue || []);
    localStorage.setItem(OFFLINE_QUEUE_KEY, json);
  } catch (e) {}
}
