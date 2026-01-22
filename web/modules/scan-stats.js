import { appState } from './state.js';
import { hasServer, logScanStat } from './api.js';

var SCAN_STATS_QUEUE_KEY = 'icsInventoryScanStatsQueue_v1';
var scanStatsQueue = [];
var syncInProgress = false;
var syncQueued = false;
var storageErrorNotified = false;
var sendErrorNotified = false;

export function loadScanStatsQueue() {
  scanStatsQueue = [];
  try {
    if (!window.localStorage) { return; }
    var raw = localStorage.getItem(SCAN_STATS_QUEUE_KEY);
    if (!raw) { return; }
    var parsed = JSON.parse(raw);
    if (parsed && parsed.splice) {
      for (var i = 0; i < parsed.length; i++) {
        if (!parsed[i].createdAt) {
          parsed[i].createdAt = new Date().toISOString();
        }
        if (!parsed[i].localId) {
          parsed[i].localId = buildLocalId(parsed[i], i);
        }
        if (!parsed[i].statId) {
          parsed[i].statId = parsed[i].localId;
        }
      }
      scanStatsQueue = parsed;
      saveScanStatsQueue();
    }
  } catch (e) {
    scanStatsQueue = [];
  }
}

export function recordScanStat(payload) {
  var entry = buildEntry(payload);
  if (!canSendNow_()) {
    enqueueStat(entry);
    return;
  }
  sendStat(entry)
    .catch(function (err) {
      if (shouldQueueError_(err)) {
        enqueueStat(entry);
      }
      notifySendError_(err, 'record');
    });
}

export function syncScanStatsQueue() {
  if (syncInProgress) {
    syncQueued = true;
    return;
  }
  if (!scanStatsQueue.length) { return; }
  if (!canSendNow_()) { return; }
  syncInProgress = true;
  var items = scanStatsQueue.slice(0);
  var snapshotIds = {};
  for (var i = 0; i < items.length; i++) {
    if (!items[i].localId) {
      items[i].localId = buildLocalId(items[i], i);
    }
    snapshotIds[items[i].localId] = true;
  }
  var remaining = [];
  var index = 0;
  var syncErrorLogged = false;

  function processNext() {
    if (index >= items.length) {
      mergeAndPersistQueue_(remaining, snapshotIds);
      finalizeSync_();
      return;
    }
    var item = items[index];
    index++;
    sendStat(item)
      .then(function () {
        processNext();
      })
      .catch(function (err) {
        if (shouldQueueError_(err)) {
          remaining.push(item);
        }
        if (!syncErrorLogged) {
          syncErrorLogged = true;
          notifySendError_(err, 'sync');
        }
        processNext();
      });
  }

  processNext();
}

function buildEntry(payload) {
  payload = payload || {};
  var createdAt = payload.createdAt || new Date().toISOString();
  var localId = payload.localId || payload.statId || buildLocalId({ createdAt: createdAt });
  return {
    localId: localId,
    statId: payload.statId || localId,
    createdAt: createdAt,
    os: payload.os || '',
    deviceModel: payload.deviceModel || '',
    browser: payload.browser || '',
    barcodeFormat: payload.barcodeFormat || payload.format || '',
    scanMs: payload.scanMs || '',
    engineId: payload.engineId || '',
    engineName: payload.engineName || '',
    online: payload.online || (getOnlineStatus_() ? 'online' : 'offline')
  };
}

function enqueueStat(entry) {
  if (!entry || !entry.localId) {
    entry = buildEntry(entry || {});
  }
  if (scanStatsQueue.length >= 200) {
    scanStatsQueue.shift();
  }
  scanStatsQueue.push(entry);
  saveScanStatsQueue();
}

function saveScanStatsQueue() {
  try {
    if (!window.localStorage) { return; }
    var json = JSON.stringify(scanStatsQueue || []);
    localStorage.setItem(SCAN_STATS_QUEUE_KEY, json);
  } catch (e) {
    if (!storageErrorNotified) {
      storageErrorNotified = true;
      console.log('Scan stats queue could not be saved.');
    }
  }
}

function mergeAndPersistQueue_(remaining, snapshotIds) {
  var currentQueue = scanStatsQueue || [];
  var appended = [];
  for (var i = 0; i < currentQueue.length; i++) {
    var item = currentQueue[i];
    if (!item.localId) { item.localId = buildLocalId(item, i); }
    if (!snapshotIds[item.localId]) { appended.push(item); }
  }
  scanStatsQueue = remaining.concat(appended);
  saveScanStatsQueue();
}

function finalizeSync_() {
  syncInProgress = false;
  if (syncQueued) {
    syncQueued = false;
    if (scanStatsQueue.length) {
      syncScanStatsQueue();
    }
  }
}

function sendStat(payload) {
  return logScanStat(appState.authToken, payload, { timeoutMs: 4000 });
}

function canSendNow_() {
  return hasServer() && !!appState.authToken && getOnlineStatus_();
}

function shouldQueueError_(err) {
  if (!err) { return true; }
  if (err.noQueue === true) { return false; }
  return true;
}

function notifySendError_(err, context) {
  if (sendErrorNotified) { return; }
  sendErrorNotified = true;
  try {
    var message = err && err.message ? err.message : 'Unknown error';
    var suffix = context ? (' (' + context + ')') : '';
    console.warn('Scan stats upload failed' + suffix + ': ' + message);
  } catch (e) {}
}

function buildLocalId(entry, index) {
  var stamp = (entry && entry.createdAt) ? entry.createdAt : new Date().toISOString();
  var suffix = (typeof index === 'number') ? String(index) : Math.random().toString(16).slice(2);
  return 'scanstat_' + stamp.replace(/[:.TZ-]/g, '') + '_' + suffix;
}

function getOnlineStatus_() {
  if (typeof navigator === 'undefined') { return true; }
  if (typeof navigator.onLine !== 'boolean') { return true; }
  return navigator.onLine;
}
