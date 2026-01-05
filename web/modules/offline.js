import { appState, OFFLINE_QUEUE_KEY } from './state.js';
import { dom } from './dom.js';
import { callApi, hasServer } from './api.js';
import { ensureAuth } from './auth.js';
import { showToast } from './toast.js';
import { refreshEntriesFromServer } from './entries.js';

var syncInProgress = false;
var syncQueued = false;

export function loadOfflineQueue() {
  appState.offlineQueue = [];
  try {
    if (!window.localStorage) { return; }
    var raw = localStorage.getItem(OFFLINE_QUEUE_KEY);
    if (!raw) { return; }
    var parsed = JSON.parse(raw);
    if (parsed && parsed.splice) {
      var needsSave = false;
      for (var i = 0; i < parsed.length; i++) {
        if (!parsed[i].localId) {
          parsed[i].localId = buildLocalId(parsed[i], i);
          needsSave = true;
        }
        if (parsed[i].quantity === undefined || parsed[i].quantity === null || parsed[i].quantity === '') {
          parsed[i].quantity = 1;
          needsSave = true;
        }
      }
      appState.offlineQueue = parsed;
      if (needsSave) { saveOfflineQueue(); }
    }
  } catch (e) {
    appState.offlineQueue = [];
  } finally {
    updateOfflineBadge();
  }
}

export function enqueueOfflineEntry(payload) {
  var createdAt = new Date().toISOString();
  var entry = {
    localId: buildLocalId({ createdAt: createdAt }),
    barcode: payload.barcode,
    room: payload.room,
    notes: payload.notes || '',
    quantity: payload.quantity || 1,
    imageDataUrl: payload.imageDataUrl || '',
    createdAt: createdAt
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
  if (syncInProgress) {
    syncQueued = true;
    return;
  }
  if (!hasServer() || !ensureAuth()) {
    showToast('Cannot sync queued items without API access.', 'error');
    return;
  }
  if (!appState.offlineQueue || !appState.offlineQueue.length) {
    showToast('No queued items to sync.', 'info');
    return;
  }
  syncInProgress = true;
  var items = appState.offlineQueue.slice(0);
  var snapshotIds = {};
  for (var i = 0; i < items.length; i++) {
    if (!items[i].localId) { items[i].localId = buildLocalId(items[i], i); }
    snapshotIds[items[i].localId] = true;
  }
  var remaining = [];
  var index = 0;
  var successCount = 0;
  showToast('Syncing ' + items.length + ' queued item(s)…', 'info');
  function processNext() {
    if (index >= items.length) {
      mergeAndPersistQueue(remaining, snapshotIds);
      if (successCount > 0) {
        showToast('Synced ' + successCount + ' item(s).', 'success');
        refreshEntriesFromServer();
      }
      finalizeSync();
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

function buildLocalId(entry, index) {
  var stamp = (entry && entry.createdAt) ? entry.createdAt : new Date().toISOString();
  var suffix = (typeof index === 'number') ? String(index) : Math.random().toString(16).slice(2);
  return 'offline_' + stamp.replace(/[:.TZ-]/g, '') + '_' + suffix;
}

function mergeAndPersistQueue(remaining, snapshotIds) {
  var currentQueue = appState.offlineQueue || [];
  var appended = [];
  for (var i = 0; i < currentQueue.length; i++) {
    var item = currentQueue[i];
    if (!item.localId) { item.localId = buildLocalId(item, i); }
    if (!snapshotIds[item.localId]) { appended.push(item); }
  }
  appState.offlineQueue = remaining.concat(appended);
  saveOfflineQueue();
  updateOfflineBadge();
}

function finalizeSync() {
  syncInProgress = false;
  if (syncQueued) {
    syncQueued = false;
    if (appState.offlineQueue && appState.offlineQueue.length) {
      syncOfflineQueue();
    }
  }
}
