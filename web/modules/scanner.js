import { appState, scannerState } from './state.js';
import { dom } from './dom.js';
import { showToast } from './toast.js';
import { triggerVibrate } from './utils.js';
import { recordScanStat } from './scan-stats.js';
import { detectCapabilities } from './scanner/capabilities.js';
import { getEngineRegistry, createSupportedEngines } from './scanner/engine-registry.js';
import { createScanManager } from './scanner/scan-manager.js';
import { createVideoFrameSource } from './scanner/frame-source.js';

var capabilitiesPromise = null;

function ensureCapabilities() {
  if (scannerState.capabilities) {
    return Promise.resolve(scannerState.capabilities);
  }
  if (capabilitiesPromise) {
    return capabilitiesPromise;
  }
  capabilitiesPromise = detectCapabilities()
    .then(function (capabilities) {
      scannerState.capabilities = capabilities;
      capabilitiesPromise = null;
      return capabilities;
    })
    .catch(function (err) {
      capabilitiesPromise = null;
      throw err;
    });
  return capabilitiesPromise;
}

function updateScanEngineStatus() {
  if (!dom.scanEngineStatus) { return; }
  var label = appState.scannerEngineLabel || 'None';
  var suffix = appState.scannerEngineAvailable ? '' : ' - unavailable';
  var winner = scannerState.lastEngineWinner;
  var winnerText = '';
  if (winner && winner.name) {
    winnerText = ' | Winner: ' + winner.name + (winner.ms ? (' (' + winner.ms + 'ms)') : '');
  }
  dom.scanEngineStatus.textContent = 'Engines: ' + label + suffix + winnerText;
}

function applyCameraDeviceOptions(devices) {
  if (!dom.cameraSelectRow || !dom.cameraSelect) { return; }
  if (!devices || devices.length <= 1) {
    dom.cameraSelectRow.classList.add('hidden');
    return;
  }
  dom.cameraSelectRow.classList.remove('hidden');
  dom.cameraSelect.innerHTML = '';
  var opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Auto (rear preferred)';
  dom.cameraSelect.appendChild(opt);
  for (var i = 0; i < devices.length; i++) {
    var d = devices[i];
    var option = document.createElement('option');
    option.value = d.deviceId || d.id || '';
    option.textContent = d.label || ('Camera ' + (i + 1));
    dom.cameraSelect.appendChild(option);
  }
}

function populateCameraSelectWithMediaDevices() {
  if (!(navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function')) {
    if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
    return;
  }
  navigator.mediaDevices.enumerateDevices()
    .then(function (devices) {
      var videoDevices = (devices || []).filter(function (device) {
        return device && device.kind === 'videoinput';
      });
      applyCameraDeviceOptions(videoDevices);
    })
    .catch(function () {
      if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
    });
}

function applyEngineSupport(capabilities) {
  var registry = getEngineRegistry();
  var supported = registry.filter(function (entry) {
    return entry.isSupported(capabilities);
  });
  appState.scannerEngines = supported.map(function (entry) { return entry.name; });
  appState.scannerEngineLabel = appState.scannerEngines.length ? appState.scannerEngines.join(', ') : 'None';
  appState.scannerEngineAvailable = appState.scannerEngines.length > 0;
  appState.scannerEngine = appState.scannerEngineAvailable ? 'multi' : '';
  scannerState.engineLabels = {};
  for (var i = 0; i < supported.length; i++) {
    scannerState.engineLabels[supported[i].id] = supported[i].name;
  }
  updateScanEngineStatus();
}

function showManualEntryPrompt(text) {
  if (dom.scanHelpText) {
    dom.scanHelpText.textContent = text || 'No barcode found. Improve lighting or distance.';
  }
  if (dom.scanHelp) {
    dom.scanHelp.classList.remove('hidden');
  }
}

function clearManualEntryPrompt() {
  if (dom.scanHelp) {
    dom.scanHelp.classList.add('hidden');
  }
}

function armScanHintTimer() {
  clearScanHintTimer();
  scannerState.scanHintTimer = setTimeout(function () {
    if (!appState.scanning) { return; }
    showManualEntryPrompt('No barcode found. Improve lighting or distance.');
  }, 10000);
}

function clearScanHintTimer() {
  if (scannerState.scanHintTimer) {
    clearTimeout(scannerState.scanHintTimer);
    scannerState.scanHintTimer = null;
  }
}

export function initScannerSupport() {
  appState.cameraSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  appState.scannerEngineAvailable = false;
  appState.scannerEngineLabel = 'Checking...';
  updateScanEngineStatus();
  clearManualEntryPrompt();

  if (!appState.cameraSupported) {
    setScanStatus('Camera scanning is not supported.', 'Idle');
    if (dom.cameraSupportMessage) {
      dom.cameraSupportMessage.textContent = 'Camera scanning is not available in this browser. You can still type barcodes manually.';
      dom.cameraSupportMessage.classList.remove('hidden');
    }
    if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
    updateScanButton();
    updateTorchUI();
    return;
  }

  ensureCapabilities()
    .then(function (capabilities) {
      applyEngineSupport(capabilities);
      updateScanButton();
      updateTorchUI();
      if (!appState.scannerEngineAvailable) {
        setScanStatus('Scanner engines unavailable.', 'Error');
        if (dom.cameraSupportMessage) {
          dom.cameraSupportMessage.textContent = 'Barcode engines are not supported on this device. You can still type barcodes manually.';
          dom.cameraSupportMessage.classList.remove('hidden');
        }
        if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
        return;
      }
      if (dom.cameraSupportMessage) { dom.cameraSupportMessage.classList.add('hidden'); }
      populateCameraSelectWithMediaDevices();
      setScanStatus('Camera off', 'Idle');
    })
    .catch(function () {
      appState.scannerEngineAvailable = false;
      appState.scannerEngineLabel = 'Unavailable';
      updateScanEngineStatus();
      setScanStatus('Scanner engines unavailable.', 'Error');
      if (dom.cameraSupportMessage) {
        dom.cameraSupportMessage.textContent = 'Barcode engines are not available in this browser.';
        dom.cameraSupportMessage.classList.remove('hidden');
      }
      updateScanButton();
      updateTorchUI();
    });
}

export function openScannerSheet() {
  dom.scannerSheet.classList.add('open');
  dom.scannerSheet.setAttribute('aria-hidden', 'false');
  appState.scannerSheetOpen = true;
  startScanner();
}

export function closeScannerSheet(options) {
  options = options || {};
  if (!appState.scannerSheetOpen) { return; }
  appState.scannerSheetOpen = false;
  dom.scannerSheet.classList.remove('open');
  dom.scannerSheet.setAttribute('aria-hidden', 'true');
  stopScanner();
  if (scannerState.autoCloseTimer) {
    clearTimeout(scannerState.autoCloseTimer);
    scannerState.autoCloseTimer = null;
  }
  if (!options.skipFocus) {
    if (options.focusRoom) {
      focusRoomField();
    } else if (dom.inputBarcode && typeof dom.inputBarcode.focus === 'function') {
      dom.inputBarcode.focus();
    }
  }
}

export function startScanner() {
  clearManualEntryPrompt();
  if (!appState.cameraSupported) {
    showToast('Camera scanning is not available on this device.', 'error');
    return;
  }
  if (!appState.scannerEngineAvailable) {
    showToast('Barcode scanning is not available in this browser.', 'error');
    setScanStatus('Scanner engines unavailable.', 'Error');
    return;
  }
  if (appState.scanning) { return; }

  appState.scanning = true;
  appState.torchSupported = null;
  appState.torchOn = false;
  updateTorchUI();
  updateScanButton();
  setScanStatus('Preparing scanner…', 'Scanning');

  ensureCapabilities()
    .then(function (capabilities) {
      applyEngineSupport(capabilities);
      if (!appState.scannerEngineAvailable) {
        throw new Error('No supported engines.');
      }
      var engines = createSupportedEngines(capabilities);
      if (!engines.length) {
        throw new Error('No supported engines.');
      }
      var frameSource = createVideoFrameSource(dom.video, {
        maxWidth: 720,
        maxHeight: 720
      });
      scannerState.scanManager = createScanManager({
        frameSource: frameSource,
        engines: engines,
        continuous: appState.continuousScanning,
        timeoutMs: 0,
        cooldownMs: scannerState.cooldownMs,
        validationOptions: {
          code39MinLen: 3,
          code39MaxLen: 64,
          code128MinLen: 4,
          code128MaxLen: 80
        },
        onResult: handleScanResult,
        onTimeout: handleScanTimeout,
        onError: handleScanError,
        onStatus: handleEngineStatus
      });
      return scannerState.scanManager.start({ deviceId: appState.selectedCameraId || '' });
    })
    .then(function () {
      if (!appState.scanning) { return; }
      setScanStatus('Scanning…', 'Scanning');
      armScanHintTimer();
      armTorchCheck();
    })
    .catch(function (err) {
      appState.scanning = false;
      updateScanButton();
      updateTorchUI();
      clearScanHintTimer();
      setScanStatus('Camera error: ' + (err && err.message ? err.message : ''), 'Error');
      showToast('Could not start camera. Check permissions.', 'error');
    });
}

function handleScanResult(result, metrics) {
  if (!result || !result.rawValue) { return; }
  var winner = {
    id: result.engineId || '',
    name: (scannerState.engineLabels && scannerState.engineLabels[result.engineId]) || result.engineId || 'engine',
    ms: (result.meta && result.meta.durationMs) ? result.meta.durationMs : null
  };
  scannerState.lastEngineWinner = winner;
  scannerState.lastMetrics = {
    timeToFirstDecodeMs: metrics ? metrics.elapsedMs : null,
    engineId: result.engineId || '',
    format: result.format || '',
    rawValue: result.rawValue
  };
  updateScanEngineStatus();
  if (metrics && metrics.elapsedMs) {
    console.info('Scanner decode', {
      timeToFirstDecodeMs: metrics.elapsedMs,
      engineId: result.engineId || '',
      format: result.format || '',
      rawValue: result.rawValue
    });
  }
  if (!appState.continuousScanning) {
    appState.scanning = false;
    updateScanButton();
    updateTorchUI();
    clearScanHintTimer();
  } else if (appState.scanning) {
    armScanHintTimer();
  }
  logScanStats(result, metrics);
  onBarcodeDetected(result.rawValue, result.format);
}

function logScanStats(result, metrics) {
  if (!result) { return; }
  var caps = scannerState.capabilities || {};
  var scanMs = metrics && metrics.elapsedMs ? Math.round(metrics.elapsedMs) : null;
  if (!scanMs && result.meta && result.meta.durationMs) {
    scanMs = Math.round(result.meta.durationMs);
  }
  var engineName = (scannerState.engineLabels && result.engineId)
    ? scannerState.engineLabels[result.engineId]
    : '';
  var osLabel = caps.platformHint || '';
  if (caps.platformVersion) {
    osLabel = osLabel ? (osLabel + ' ' + caps.platformVersion) : caps.platformVersion;
  }
  var payload = {
    os: osLabel,
    deviceModel: caps.deviceModel || '',
    browser: caps.browserHint || '',
    barcodeFormat: result.format || '',
    scanMs: scanMs || '',
    engineId: result.engineId || '',
    engineName: engineName || result.engineId || '',
    online: (typeof navigator !== 'undefined' && navigator.onLine === false) ? 'offline' : 'online'
  };
  recordScanStat(payload);
}

function handleScanTimeout() {
  appState.scanning = false;
  updateScanButton();
  updateTorchUI();
  setScanStatus('No barcode detected.', 'Timeout');
  showManualEntryPrompt('No barcode found. Improve lighting or distance.');
  showToast('No barcode detected. Try better lighting or distance.', 'info');
  if (scannerState.scanManager) {
    scannerState.scanManager = null;
  }
  clearScanHintTimer();
}

function handleScanError(err) {
  appState.scanning = false;
  updateScanButton();
  updateTorchUI();
  setScanStatus('Camera error: ' + (err && err.message ? err.message : ''), 'Error');
  showToast('Could not start camera. Check permissions.', 'error');
  if (scannerState.scanManager) {
    scannerState.scanManager = null;
  }
  clearScanHintTimer();
}

function handleEngineStatus(payload) {
  if (!payload || !payload.error) { return; }
  console.log('Engine error:', payload.engineId, payload.error);
}

export function stopScanner() {
  appState.scanning = false;
  clearManualEntryPrompt();
  clearScanHintTimer();
  if (scannerState.scanManager && typeof scannerState.scanManager.stop === 'function') {
    scannerState.scanManager.stop();
  }
  scannerState.scanManager = null;
  if (appState.torchOn) { setTorchEnabled(false, false); }
  appState.torchSupported = false;
  appState.torchOn = false;
  updateTorchUI();
  updateScanButton();
  setScanStatus('Camera off', 'Idle');
}

export function toggleTorch() {
  if (!appState.scanning || !appState.torchSupported) { return; }
  setTorchEnabled(!appState.torchOn, true);
}

function getActiveVideoTrack() {
  try {
    if (dom.video && dom.video.srcObject && typeof dom.video.srcObject.getVideoTracks === 'function') {
      var tracks = dom.video.srcObject.getVideoTracks();
      return tracks && tracks.length ? tracks[0] : null;
    }
  } catch (e) {}
  return null;
}

function armTorchCheck() {
  scheduleTorchCheck();
  if (!dom.video || typeof dom.video.addEventListener !== 'function') { return; }
  dom.video.addEventListener('playing', scheduleTorchCheck, { once: true });
}

function scheduleTorchCheck() {
  var attempts = 0;
  function check() {
    attempts++;
    if (!appState.scanning) { return; }
    var track = getActiveVideoTrack();
    if (track) {
      refreshTorchSupport(track);
      return;
    }
    if (attempts < 10) { setTimeout(check, 200); }
  }
  setTimeout(check, 200);
}

function refreshTorchSupport(track) {
  var supported = false;
  if (track && typeof track.getCapabilities === 'function') {
    var caps = track.getCapabilities();
    supported = !!(caps && caps.torch);
  } else if (track && typeof track.applyConstraints === 'function') {
    supported = true;
  }
  appState.torchSupported = supported;
  if (!supported) { appState.torchOn = false; }
  updateTorchUI();
}

function updateTorchUI() {
  if (!dom.torchRow || !dom.btnToggleTorch || !dom.torchHint) { return; }
  if (!appState.cameraSupported || !appState.scannerEngineAvailable) {
    dom.btnToggleTorch.disabled = true;
    dom.btnToggleTorch.textContent = '🔦 Flashlight';
    dom.torchHint.textContent = 'Unavailable';
    return;
  }
  var isScanning = appState.scanning;
  if (!isScanning) {
    dom.btnToggleTorch.disabled = true;
    dom.btnToggleTorch.textContent = '🔦 Flashlight';
    dom.torchHint.textContent = 'Camera off';
    return;
  }
  if (appState.torchSupported === null) {
    dom.btnToggleTorch.disabled = true;
    dom.btnToggleTorch.textContent = '🔦 Flashlight';
    dom.torchHint.textContent = 'Checking...';
    return;
  }
  dom.btnToggleTorch.disabled = !appState.torchSupported;
  dom.btnToggleTorch.textContent = appState.torchOn ? '🔦 Flashlight on' : '🔦 Flashlight';
  dom.torchHint.textContent = appState.torchSupported ? (appState.torchOn ? 'On' : 'Off') : 'Not supported';
}

function setTorchEnabled(enabled, showFailureToast) {
  var track = getActiveVideoTrack();
  if (!track || typeof track.applyConstraints !== 'function') { return; }
  var constraints = { advanced: [{ torch: !!enabled }] };
  track.applyConstraints(constraints)
    .then(function () {
      appState.torchOn = !!enabled;
      updateTorchUI();
    })
    .catch(function () {
      appState.torchOn = false;
      updateTorchUI();
      if (showFailureToast) { showToast('Flashlight not available on this camera.', 'error'); }
    });
}

function onBarcodeDetected(text, format) {
  if (!text) { return; }
  var now = Date.now();
  if (scannerState.lastCode === text && (now - scannerState.lastCodeTime) < scannerState.cooldownMs) { return; }
  scannerState.lastCode = text;
  scannerState.lastCodeTime = now;

  dom.inputBarcode.value = text;
  var formatLabel = format ? format.replace(/_/g, ' ').toUpperCase() : 'BARCODE';
  setScanStatus(formatLabel + ': ' + text, 'Detected');
  clearManualEntryPrompt();
  flashScannerSuccess();
  triggerVibrate(80);

  if (!appState.continuousScanning) {
    if (scannerState.autoCloseTimer) { clearTimeout(scannerState.autoCloseTimer); }
    scannerState.autoCloseTimer = setTimeout(function () {
      closeScannerSheet({ focusRoom: true });
    }, 320);
  } else {
    focusRoomField();
  }
}

function setScanStatus(text, badge) {
  if (dom.scanStatus) { dom.scanStatus.textContent = text || ''; }
  if (dom.scanStatusBadge) { dom.scanStatusBadge.textContent = badge || 'Status'; }
}

function updateScanButton() {
  if (!dom.btnStopScan) { return; }
  if (!appState.cameraSupported) {
    dom.btnStopScan.disabled = true;
    dom.btnStopScan.textContent = 'Camera unavailable';
    return;
  }
  if (!appState.scannerEngineAvailable) {
    dom.btnStopScan.disabled = true;
    dom.btnStopScan.textContent = 'Scanner unavailable';
    return;
  }
  dom.btnStopScan.disabled = false;
  dom.btnStopScan.textContent = appState.scanning ? '■ Stop' : '▶ Resume';
}

function flashScannerSuccess() {
  dom.videoShell.classList.add('scan-video-shell-success');
  setTimeout(function () { dom.videoShell.classList.remove('scan-video-shell-success'); }, 190);
}

function focusRoomField() {
  try {
    if (dom.selectRoom && typeof dom.selectRoom.focus === 'function') {
      dom.selectRoom.focus();
    }
  } catch (e) {}
}
