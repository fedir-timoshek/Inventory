import { appState, scannerState } from './state.js';
import { dom } from './dom.js';
import { showToast } from './toast.js';
import { triggerVibrate } from './utils.js';

var scanConfig = readScanConfig_();
var scanDebug = createScanDebug_();
var scanSession = createScanSession_();

function getUserAgent() {
  return (navigator && navigator.userAgent) ? navigator.userAgent : '';
}

function isAndroidPlatform() {
  return /Android/i.test(getUserAgent());
}

function isIOSPlatform() {
  var ua = getUserAgent();
  var isIOS = /iPad|iPhone|iPod/i.test(ua);
  var isIPadOS = navigator && navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return isIOS || isIPadOS;
}

function supportsZXing() {
  return !!(window.ZXing && ZXing.BrowserMultiFormatReader);
}

function supportsBarcodeDetector() {
  return typeof window.BarcodeDetector === 'function';
}

function selectScannerEngine() {
  var preference = scanConfig && scanConfig.scanEngine ? scanConfig.scanEngine : 'auto';
  if (preference === 'native') {
    return {
      engine: 'barcode-detector',
      label: 'BarcodeDetector (forced)',
      available: supportsBarcodeDetector()
    };
  }
  if (preference === 'fallback') {
    return {
      engine: 'zxing',
      label: 'ZXing (forced)',
      available: supportsZXing()
    };
  }
  if (preference === 'auto') {
    if (supportsBarcodeDetector()) {
      return {
        engine: 'barcode-detector',
        label: 'BarcodeDetector (auto)',
        available: true
      };
    }
    return {
      engine: 'zxing',
      label: 'ZXing (auto)',
      available: supportsZXing()
    };
  }
  if (isAndroidPlatform()) {
    return {
      engine: 'barcode-detector',
      label: 'BarcodeDetector (legacy)',
      available: supportsBarcodeDetector()
    };
  }
  return {
    engine: 'zxing',
    label: isIOSPlatform() ? 'ZXing (legacy iOS)' : 'ZXing (legacy)',
    available: supportsZXing()
  };
}

function updateScanEngineStatus() {
  if (!dom.scanEngineStatus) { return; }
  var label = appState.scannerEngineLabel || 'Unknown';
  var suffix = appState.scannerEngineAvailable ? '' : ' - unavailable';
  dom.scanEngineStatus.textContent = 'Engine: ' + label + suffix;
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

function populateCameraSelectWithZXing() {
  try {
    if (!supportsZXing() || typeof Promise === 'undefined') {
      if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
      return;
    }
    var tempReader = new ZXing.BrowserMultiFormatReader();
    tempReader.listVideoInputDevices()
      .then(function (devices) {
        applyCameraDeviceOptions(devices || []);
      })
      .catch(function () {
        if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
      });
  } catch (e) {
    if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
  }
}

function ensureBarcodeDetectorReady() {
  if (scannerState.barcodeDetector) {
    return Promise.resolve(scannerState.barcodeDetector);
  }
  if (!supportsBarcodeDetector()) {
    return Promise.reject(new Error('BarcodeDetector API not supported.'));
  }
  var formatsPromise = (typeof BarcodeDetector.getSupportedFormats === 'function')
    ? BarcodeDetector.getSupportedFormats()
    : Promise.resolve([]);
  return Promise.resolve(formatsPromise)
    .catch(function () { return []; })
    .then(function (formats) {
      var formatList = Array.isArray(formats) ? formats : [];
      var picked = pickBarcodeDetectorFormats_(formatList);
      scannerState.barcodeDetectorFormats = picked.slice();
      var options = picked.length ? { formats: picked } : undefined;
      scannerState.barcodeDetector = new BarcodeDetector(options);
      return scannerState.barcodeDetector;
    });
}

export function initScannerSupport() {
  appState.cameraSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var engineInfo = selectScannerEngine();
  appState.scannerEngine = engineInfo.engine;
  appState.scannerEngineLabel = engineInfo.label;
  appState.scannerEngineAvailable = engineInfo.available;
  updateScanEngineStatus();
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
  if (!appState.scannerEngineAvailable) {
    setScanStatus('Scanner engine unavailable.', 'Error');
    if (dom.cameraSupportMessage) {
      dom.cameraSupportMessage.textContent = appState.scannerEngine === 'barcode-detector'
        ? 'BarcodeDetector API is not supported in this browser. Update Chrome on Android or use another device.'
        : 'Barcode scanner library is not available. You can still type barcodes manually.';
      dom.cameraSupportMessage.classList.remove('hidden');
    }
    if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
    updateScanButton();
    updateTorchUI();
    return;
  }

  if (dom.cameraSupportMessage) { dom.cameraSupportMessage.classList.add('hidden'); }
  updateScanButton();
  updateTorchUI();

  if (appState.scannerEngine === 'barcode-detector') {
    populateCameraSelectWithMediaDevices();
  } else {
    populateCameraSelectWithZXing();
  }
  setScanStatus('Camera off', 'Idle');
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
  if (!appState.cameraSupported) {
    showToast('Camera scanning is not available on this device.', 'error');
    return;
  }
  if (!appState.scannerEngineAvailable) {
    showToast('Barcode scanning is not available in this browser.', 'error');
    setScanStatus('Scanner engine unavailable.', 'Error');
    return;
  }
  if (appState.scanning) { return; }

  if (appState.scannerEngine === 'barcode-detector') {
    startBarcodeDetectorScanner();
    return;
  }

  if (!supportsZXing()) {
    setScanStatus('Scanner library failed to load.', 'Error');
    showToast('Barcode scanner library not available.', 'error');
    return;
  }

  if (!scannerState.codeReader || scannerState.zxingProfile !== scanSession.profile) {
    scannerState.codeReader = createZXingReader_();
    scannerState.zxingProfile = scanSession.profile;
  }
  configureZXingReader_();

  beginScanSession_();
  appState.scanning = true;
  appState.torchSupported = null;
  appState.torchOn = false;
  updateTorchUI();
  updateScanButton();
  setScanStatus('Requesting camera…', 'Scanning');

  try {
    var startPromise;
    if (isBalancedProfile_()) {
      startPromise = scannerState.codeReader.decodeFromConstraints(buildVideoConstraints_(), dom.video, function (result, err) {
        if (!appState.scanning) { return; }
        recordScanResult_(!!result);
        if (result) {
          var text = result.text || (result.getText ? result.getText() : '');
          onBarcodeDetected(text);
        } else if (err && err.name !== 'NotFoundException') { console.log('Decode error:', err); }
      });
    } else {
      var deviceId = appState.selectedCameraId || undefined;
      startPromise = scannerState.codeReader.decodeFromVideoDevice(deviceId, dom.video, function (result, err) {
        if (!appState.scanning) { return; }
        recordScanResult_(!!result);
        if (result) {
          var text = result.text || (result.getText ? result.getText() : '');
          onBarcodeDetected(text);
        } else if (err && err.name !== 'NotFoundException') { console.log('Decode error:', err); }
      });
    }
    if (startPromise && typeof startPromise.catch === 'function') {
      startPromise.catch(function (err) {
        appState.scanning = false;
        updateScanButton();
        setScanStatus('Camera error: ' + (err && err.message ? err.message : ''), 'Error');
        showToast('Could not start camera. Check permissions.', 'error');
      });
    }
    setScanStatus('Scanning…', 'Scanning');
    armTorchCheck();
  } catch (e) {
    appState.scanning = false;
    updateScanButton();
    setScanStatus('Camera error: ' + (e && e.message ? e.message : ''), 'Error');
    showToast('Could not start camera.', 'error');
  }
}

function startBarcodeDetectorScanner() {
  beginScanSession_();
  appState.scanning = true;
  appState.torchSupported = null;
  appState.torchOn = false;
  updateTorchUI();
  updateScanButton();
  setScanStatus('Requesting camera…', 'Scanning');

  ensureBarcodeDetectorReady()
    .then(function () {
      if (!appState.scanning) { throw new Error('Scan cancelled.'); }
      return startBarcodeDetectorStream();
    })
    .then(function () {
      if (!appState.scanning) { return; }
      setScanStatus('Scanning…', 'Scanning');
      armTorchCheck();
      startBarcodeDetectLoop();
    })
    .catch(function (err) {
      if (!appState.scanning) { return; }
      appState.scanning = false;
      updateScanButton();
      setScanStatus('Camera error: ' + (err && err.message ? err.message : ''), 'Error');
      showToast('Could not start camera. Check permissions.', 'error');
    });
}

function startBarcodeDetectorStream() {
  var constraints = buildVideoConstraints_();
  return navigator.mediaDevices.getUserMedia(constraints)
    .then(function (stream) {
      if (!dom.video) {
        if (stream && typeof stream.getTracks === 'function') {
          stream.getTracks().forEach(function (t) { t.stop(); });
        }
        throw new Error('Video element not available.');
      }
      dom.video.srcObject = stream;
      var playPromise = dom.video.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        return playPromise;
      }
      return null;
    });
}

function startBarcodeDetectLoop() {
  scannerState.barcodeDetectLastTs = 0;
  stopBarcodeDetectLoop();
  scannerState.barcodeDetectUsingVfc = shouldUseVideoFrameCallback_();
  scheduleNextBarcodeDetect_();
}

function stopBarcodeDetectLoop() {
  if (scannerState.barcodeDetectRaf) {
    cancelAnimationFrame(scannerState.barcodeDetectRaf);
  }
  if (scannerState.barcodeDetectVfcId && dom.video && typeof dom.video.cancelVideoFrameCallback === 'function') {
    dom.video.cancelVideoFrameCallback(scannerState.barcodeDetectVfcId);
  }
  scannerState.barcodeDetectRaf = 0;
  scannerState.barcodeDetectVfcId = 0;
  scannerState.barcodeDetectBusy = false;
}

function runBarcodeDetectLoop(timestamp) {
  if (!appState.scanning || !scannerState.barcodeDetector) { return; }
  var nowTs = (typeof timestamp === 'number') ? timestamp : getNowMs_();
  if (scannerState.barcodeDetectBusy) {
    scheduleNextBarcodeDetect_();
    return;
  }
  var intervalMs = getDetectIntervalMs_();
  if (nowTs - scannerState.barcodeDetectLastTs < intervalMs) {
    scheduleNextBarcodeDetect_();
    return;
  }
  if (!dom.video || dom.video.readyState < 2) {
    scheduleNextBarcodeDetect_();
    return;
  }
  scannerState.barcodeDetectBusy = true;
  scannerState.barcodeDetectLastTs = nowTs;
  var source = getBarcodeDetectSource_(dom.video);
  scannerState.barcodeDetector.detect(source)
    .then(function (barcodes) {
      scannerState.barcodeDetectBusy = false;
      if (!appState.scanning) { return; }
      if (barcodes && barcodes.length) {
        recordScanResult_(true);
        var value = getBarcodeValue(barcodes[0]);
        onBarcodeDetected(value);
      } else {
        recordScanResult_(false);
      }
      if (appState.scanning) {
        scheduleNextBarcodeDetect_();
      }
    })
    .catch(function () {
      scannerState.barcodeDetectBusy = false;
      recordScanResult_(false);
      if (appState.scanning) {
        scheduleNextBarcodeDetect_();
      }
    });
}

function getBarcodeValue(barcode) {
  if (!barcode) { return ''; }
  return barcode.rawValue || barcode.data || barcode.displayValue || '';
}

export function stopScanner() {
  appState.scanning = false;
  endScanSession_();
  stopBarcodeDetectLoop();
  if (appState.torchOn) { setTorchEnabled(false, false); }
  appState.torchSupported = false;
  appState.torchOn = false;
  updateTorchUI();
  updateScanButton();
  try {
    if (scannerState.codeReader && typeof scannerState.codeReader.reset === 'function') {
      scannerState.codeReader.reset();
    }
  } catch (e) { console.log('Error resetting reader:', e); }

  try {
    if (dom.video && dom.video.srcObject && typeof dom.video.srcObject.getTracks === 'function') {
      dom.video.srcObject.getTracks().forEach(function (t) { t.stop(); });
    }
    if (dom.video) { dom.video.srcObject = null; }
  } catch (err) { console.log('Error stopping camera tracks:', err); }

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
  configureTrackForScanning_(track);
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

function onBarcodeDetected(text) {
  if (!text) { return; }
  var now = Date.now();
  if (scannerState.lastCode === text && (now - scannerState.lastCodeTime) < scannerState.cooldownMs) { return; }
  scannerState.lastCode = text;
  scannerState.lastCodeTime = now;

  dom.inputBarcode.value = text;
  setScanStatus('Barcode: ' + text, 'Detected');
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

function readScanConfig_() {
  var config = { scanDebug: false, scanEngine: 'auto', scanProfile: 'legacy' };
  try {
    if (typeof window === 'undefined' || !window.location) { return config; }
    var params = new URLSearchParams(window.location.search);
    config.scanDebug = params.get('scanDebug') === '1';
    var engine = (params.get('scanEngine') || '').toLowerCase();
    if (engine === 'auto' || engine === 'native' || engine === 'fallback' || engine === 'legacy') {
      config.scanEngine = engine;
    }
    var profile = (params.get('scanProfile') || '').toLowerCase();
    if (profile === 'balanced' || profile === 'legacy') {
      config.scanProfile = profile;
    }
  } catch (e) {}
  return config;
}

function createScanDebug_() {
  var enabled = !!(scanConfig && scanConfig.scanDebug);
  var state = {
    enabled: enabled,
    startedAt: 0,
    firstDecodeMs: null,
    attempts: 0,
    successes: 0,
    lastAttempts: [],
    rafId: 0,
    lastRafTs: 0,
    frameCount: 0,
    jankFrames: 0,
    totalFrameMs: 0
  };
  if (enabled && typeof window !== 'undefined') {
    window.__scanDebug = state;
  }
  return state;
}

function createScanSession_() {
  return {
    profile: scanConfig && scanConfig.scanProfile ? scanConfig.scanProfile : 'legacy',
    startedAt: 0,
    lastSuccessTs: 0,
    noSuccessStartTs: 0,
    lastHintTs: 0,
    lastFarTs: 0,
    trackConfigured: false,
    activeTrack: null,
    zoomApplied: false,
    zoomValue: 0,
    fastIntervalMs: 120,
    farEveryMs: 400,
    fastRoi: { widthRatio: 0.6, heightRatio: 0.45 },
    farRoi: { widthRatio: 0.9, heightRatio: 0.7 },
    fastMaxWidth: 640,
    farMaxWidth: 1600,
    fastScaleUp: 1,
    farScaleUp: 1.4,
    autoZoomDelayMs: 1800
  };
}

function resetScanSession_() {
  scanSession.profile = scanConfig && scanConfig.scanProfile ? scanConfig.scanProfile : 'legacy';
  scanSession.startedAt = getNowMs_();
  scanSession.lastSuccessTs = 0;
  scanSession.noSuccessStartTs = 0;
  scanSession.lastHintTs = 0;
  scanSession.lastFarTs = 0;
  scanSession.trackConfigured = false;
  scanSession.activeTrack = null;
  scanSession.zoomApplied = false;
  scanSession.zoomValue = 0;
}

function beginScanSession_() {
  resetScanSession_();
  if (!scanDebug.enabled) { return; }
  resetScanDebug_();
  startJankMonitor_();
}

function endScanSession_() {
  resetAutoZoom_('stop');
  if (!scanDebug.enabled) { return; }
  stopJankMonitor_();
  reportScanDebug_('stop');
}

function resetScanDebug_() {
  scanDebug.startedAt = getNowMs_();
  scanDebug.firstDecodeMs = null;
  scanDebug.attempts = 0;
  scanDebug.successes = 0;
  scanDebug.lastAttempts = [];
  scanDebug.lastRafTs = 0;
  scanDebug.frameCount = 0;
  scanDebug.jankFrames = 0;
  scanDebug.totalFrameMs = 0;
}

function recordDecodeAttempt_(success) {
  if (!scanDebug.enabled) { return; }
  scanDebug.attempts += 1;
  if (success) {
    scanDebug.successes += 1;
    if (scanDebug.firstDecodeMs === null) {
      scanDebug.firstDecodeMs = Math.max(0, getNowMs_() - scanDebug.startedAt);
    }
  }
  scanDebug.lastAttempts.push(!!success);
  if (scanDebug.lastAttempts.length > 20) {
    scanDebug.lastAttempts.shift();
  }
}

function recordScanResult_(success) {
  var now = getNowMs_();
  if (success) {
    scanSession.lastSuccessTs = now;
    scanSession.noSuccessStartTs = 0;
  } else if (!scanSession.noSuccessStartTs) {
    scanSession.noSuccessStartTs = now;
  }
  maybeApplyAutoZoom_();
  maybeShowScanHint_();
  recordDecodeAttempt_(success);
}

function isBalancedProfile_() {
  return scanSession.profile === 'balanced';
}

function maybeShowScanHint_() {
  if (!isBalancedProfile_()) { return; }
  if (!scanSession.noSuccessStartTs) { return; }
  var now = getNowMs_();
  if (now - scanSession.noSuccessStartTs < 2000) { return; }
  if (now - scanSession.lastHintTs < 8000) { return; }
  showToast('Move closer, keep the code centered, and hold steady.', 'info');
  scanSession.lastHintTs = now;
}

function maybeApplyAutoZoom_() {
  if (!isBalancedProfile_()) { return; }
  if (scanSession.zoomApplied) { return; }
  if (!scanSession.activeTrack) { return; }
  var now = getNowMs_();
  var sinceSuccess = scanSession.lastSuccessTs ? (now - scanSession.lastSuccessTs) : (now - scanSession.startedAt);
  if (sinceSuccess < scanSession.autoZoomDelayMs) { return; }
  var caps = getTrackCapabilities_(scanSession.activeTrack);
  if (!caps || !caps.zoom) { return; }
  var desired = caps.zoom.min + (caps.zoom.max - caps.zoom.min) * 0.35;
  desired = alignToStep_(desired, caps.zoom.step);
  applyTrackConstraints_(scanSession.activeTrack, { zoom: desired });
  scanSession.zoomApplied = true;
  scanSession.zoomValue = desired;
}

function resetAutoZoom_(reason) {
  if (!scanSession.zoomApplied) { return; }
  if (!scanSession.activeTrack) { return; }
  var caps = getTrackCapabilities_(scanSession.activeTrack);
  if (!caps || !caps.zoom) { return; }
  var desired = alignToStep_(caps.zoom.min, caps.zoom.step);
  applyTrackConstraints_(scanSession.activeTrack, { zoom: desired });
  scanSession.zoomApplied = false;
  scanSession.zoomValue = desired;
  if (scanDebug.enabled) {
    console.log('[scanDebug] zoom reset', reason || '');
  }
}

function reportScanDebug_(label) {
  if (!scanDebug.enabled) { return; }
  var snapshot = getScanDebugSnapshot_();
  console.log('[scanDebug]', label || 'report', snapshot);
}

function getScanDebugSnapshot_() {
  var now = getNowMs_();
  var elapsedMs = Math.max(1, now - scanDebug.startedAt);
  var attemptsPerSec = scanDebug.attempts / (elapsedMs / 1000);
  var windowAttempts = scanDebug.lastAttempts.length;
  var windowSuccesses = 0;
  for (var i = 0; i < scanDebug.lastAttempts.length; i++) {
    if (scanDebug.lastAttempts[i]) { windowSuccesses += 1; }
  }
  var successRate20 = windowAttempts ? (windowSuccesses / windowAttempts) : 0;
  var avgFrameMs = scanDebug.frameCount ? (scanDebug.totalFrameMs / scanDebug.frameCount) : 0;
  return {
    elapsedMs: Math.round(elapsedMs),
    attempts: scanDebug.attempts,
    successes: scanDebug.successes,
    attemptsPerSec: round2_(attemptsPerSec),
    firstDecodeMs: scanDebug.firstDecodeMs === null ? null : Math.round(scanDebug.firstDecodeMs),
    successRate20: round2_(successRate20),
    jankFrames: scanDebug.jankFrames,
    avgFrameMs: round2_(avgFrameMs)
  };
}

function startJankMonitor_() {
  if (!scanDebug.enabled || scanDebug.rafId) { return; }
  scanDebug.lastRafTs = 0;
  var tick = function (ts) {
    if (!scanDebug.enabled) { return; }
    if (scanDebug.lastRafTs) {
      var delta = ts - scanDebug.lastRafTs;
      scanDebug.frameCount += 1;
      scanDebug.totalFrameMs += delta;
      if (delta > 120) { scanDebug.jankFrames += 1; }
    }
    scanDebug.lastRafTs = ts;
    scanDebug.rafId = requestAnimationFrame(tick);
  };
  scanDebug.rafId = requestAnimationFrame(tick);
}

function stopJankMonitor_() {
  if (scanDebug.rafId) {
    cancelAnimationFrame(scanDebug.rafId);
    scanDebug.rafId = 0;
  }
}

function buildVideoConstraints_() {
  var video = { facingMode: { ideal: 'environment' } };
  if (appState.selectedCameraId) {
    video.deviceId = { exact: appState.selectedCameraId };
  }
  if (isBalancedProfile_()) {
    video.width = { ideal: 1280 };
    video.height = { ideal: 720 };
  }
  return { video: video, audio: false };
}

function configureTrackForScanning_(track) {
  if (!track) { return; }
  scanSession.activeTrack = track;
  if (!isBalancedProfile_()) { return; }
  if (scanSession.trackConfigured) { return; }
  scanSession.trackConfigured = true;
  var caps = getTrackCapabilities_(track);
  if (!caps) { return; }
  var constraints = {};
  var focusMode = pickCapMode_(caps.focusMode, ['continuous', 'auto']);
  if (focusMode) { constraints.focusMode = focusMode; }
  var exposureMode = pickCapMode_(caps.exposureMode, ['continuous', 'auto']);
  if (exposureMode) { constraints.exposureMode = exposureMode; }
  var whiteBalanceMode = pickCapMode_(caps.whiteBalanceMode, ['continuous', 'auto']);
  if (whiteBalanceMode) { constraints.whiteBalanceMode = whiteBalanceMode; }
  if (Object.keys(constraints).length) {
    applyTrackConstraints_(track, constraints);
  }
}

function getTrackCapabilities_(track) {
  try {
    if (track && typeof track.getCapabilities === 'function') {
      return track.getCapabilities();
    }
  } catch (e) {}
  return null;
}

function applyTrackConstraints_(track, constraints) {
  if (!track || typeof track.applyConstraints !== 'function') { return; }
  try {
    track.applyConstraints({ advanced: [constraints] })
      .catch(function () {});
  } catch (e) {}
}

function pickCapMode_(modes, preferred) {
  if (!modes || !modes.length) { return ''; }
  for (var i = 0; i < preferred.length; i++) {
    if (modes.indexOf(preferred[i]) > -1) {
      return preferred[i];
    }
  }
  return '';
}

function alignToStep_(value, step) {
  if (!step || step <= 0) { return value; }
  return Math.round(value / step) * step;
}

function shouldUseVideoFrameCallback_() {
  return isBalancedProfile_() && dom.video && typeof dom.video.requestVideoFrameCallback === 'function';
}

function scheduleNextBarcodeDetect_() {
  if (scannerState.barcodeDetectUsingVfc && dom.video && typeof dom.video.requestVideoFrameCallback === 'function') {
    scannerState.barcodeDetectVfcId = dom.video.requestVideoFrameCallback(runBarcodeDetectLoop);
  } else {
    scannerState.barcodeDetectRaf = requestAnimationFrame(runBarcodeDetectLoop);
  }
}

function getDetectIntervalMs_() {
  if (isBalancedProfile_()) {
    return scanSession.fastIntervalMs;
  }
  return scannerState.barcodeDetectIntervalMs;
}

function getBarcodeDetectSource_(video) {
  if (!isBalancedProfile_() || !video || !video.videoWidth || !video.videoHeight) {
    return video;
  }
  var pass = getScanPass_(video.videoWidth, video.videoHeight);
  if (!pass || !pass.roi || !pass.target) { return video; }
  var canvasInfo = ensureBarcodeCanvas_(pass.target.width, pass.target.height);
  var ctx = canvasInfo.ctx;
  ctx.imageSmoothingEnabled = true;
  if (ctx.imageSmoothingQuality) { ctx.imageSmoothingQuality = 'high'; }
  ctx.drawImage(video, pass.roi.sx, pass.roi.sy, pass.roi.sw, pass.roi.sh, 0, 0, pass.target.width, pass.target.height);
  return canvasInfo.canvas;
}

function ensureBarcodeCanvas_(width, height) {
  if (!scannerState.barcodeCanvas) {
    scannerState.barcodeCanvas = document.createElement('canvas');
  }
  if (scannerState.barcodeCanvas.width !== width || scannerState.barcodeCanvas.height !== height) {
    scannerState.barcodeCanvas.width = width;
    scannerState.barcodeCanvas.height = height;
  }
  if (!scannerState.barcodeCanvasCtx) {
    scannerState.barcodeCanvasCtx = scannerState.barcodeCanvas.getContext('2d');
  }
  return { canvas: scannerState.barcodeCanvas, ctx: scannerState.barcodeCanvasCtx };
}

function getScanPass_(videoW, videoH) {
  if (!isBalancedProfile_()) { return null; }
  var now = getNowMs_();
  var useFar = (now - scanSession.lastFarTs) >= scanSession.farEveryMs;
  var roiConfig = useFar ? scanSession.farRoi : scanSession.fastRoi;
  if (useFar) { scanSession.lastFarTs = now; }
  var roi = computeCenteredRoi_(videoW, videoH, roiConfig.widthRatio, roiConfig.heightRatio);
  var maxWidth = useFar ? scanSession.farMaxWidth : scanSession.fastMaxWidth;
  var scaleUp = useFar ? scanSession.farScaleUp : scanSession.fastScaleUp;
  var target = getTargetSize_(roi.sw, roi.sh, maxWidth, scaleUp);
  return { mode: useFar ? 'far' : 'fast', roi: roi, target: target };
}

function computeCenteredRoi_(videoW, videoH, widthRatio, heightRatio) {
  var sw = Math.max(1, Math.round(videoW * widthRatio));
  var sh = Math.max(1, Math.round(videoH * heightRatio));
  var sx = Math.max(0, Math.floor((videoW - sw) / 2));
  var sy = Math.max(0, Math.floor((videoH - sh) / 2));
  return { sx: sx, sy: sy, sw: sw, sh: sh };
}

function getTargetSize_(sourceW, sourceH, maxWidth, scaleUp) {
  var targetW = sourceW;
  if (scaleUp && scaleUp > 1) {
    targetW = Math.round(sourceW * scaleUp);
  }
  var width = Math.min(targetW, maxWidth);
  var height = Math.max(1, Math.round(width * (sourceH / sourceW)));
  return { width: width, height: height };
}

function pickBarcodeDetectorFormats_(formats) {
  if (!Array.isArray(formats) || !formats.length) { return []; }
  if (!isBalancedProfile_()) { return formats.slice(); }
  var preferred = ['code_128', 'code_39'];
  var picked = [];
  for (var i = 0; i < preferred.length; i++) {
    if (formats.indexOf(preferred[i]) > -1) {
      picked.push(preferred[i]);
    }
  }
  for (var j = 0; j < formats.length; j++) {
    if (picked.indexOf(formats[j]) === -1) {
      picked.push(formats[j]);
    }
  }
  return picked;
}

function createZXingReader_() {
  scannerState.zxingOriginalDrawFrame = null;
  var hints = buildZXingHints_(isBalancedProfile_());
  var delay = isBalancedProfile_() ? 200 : 500;
  try {
    return new ZXing.BrowserMultiFormatReader(hints, delay);
  } catch (e) {
    return new ZXing.BrowserMultiFormatReader();
  }
}

function configureZXingReader_() {
  if (!scannerState.codeReader) { return; }
  if (!scannerState.zxingOriginalDrawFrame) {
    scannerState.zxingOriginalDrawFrame = scannerState.codeReader.drawFrameOnCanvas;
  }
  if (isBalancedProfile_()) {
    scannerState.codeReader.timeBetweenDecodingAttempts = scanSession.fastIntervalMs;
    scannerState.codeReader.timeBetweenScansMillis = 200;
    scannerState.codeReader.drawFrameOnCanvas = function (srcElement, dimensions, canvasElementContext) {
      if (!srcElement || !srcElement.videoWidth || !srcElement.videoHeight || !canvasElementContext) {
        return scannerState.zxingOriginalDrawFrame.call(scannerState.codeReader, srcElement, dimensions, canvasElementContext);
      }
      var pass = getScanPass_(srcElement.videoWidth, srcElement.videoHeight);
      if (!pass || !pass.roi) {
        return scannerState.zxingOriginalDrawFrame.call(scannerState.codeReader, srcElement, dimensions, canvasElementContext);
      }
      canvasElementContext.imageSmoothingEnabled = true;
      if (canvasElementContext.imageSmoothingQuality) { canvasElementContext.imageSmoothingQuality = 'high'; }
      var targetW = pass.target && pass.target.width ? pass.target.width : srcElement.videoWidth;
      var targetH = pass.target && pass.target.height ? pass.target.height : srcElement.videoHeight;
      if (canvasElementContext.canvas) {
        if (canvasElementContext.canvas.width !== targetW || canvasElementContext.canvas.height !== targetH) {
          canvasElementContext.canvas.width = targetW;
          canvasElementContext.canvas.height = targetH;
        }
      }
      canvasElementContext.drawImage(
        srcElement,
        pass.roi.sx,
        pass.roi.sy,
        pass.roi.sw,
        pass.roi.sh,
        0,
        0,
        targetW,
        targetH
      );
    };
  } else if (scannerState.zxingOriginalDrawFrame) {
    scannerState.codeReader.drawFrameOnCanvas = scannerState.zxingOriginalDrawFrame;
  }
}

function buildZXingHints_(tryHarder) {
  if (!window.ZXing || !ZXing.DecodeHintType || !ZXing.BarcodeFormat) { return null; }
  var formats = [];
  if (ZXing.BarcodeFormat.CODE_128) { formats.push(ZXing.BarcodeFormat.CODE_128); }
  if (ZXing.BarcodeFormat.CODE_39) { formats.push(ZXing.BarcodeFormat.CODE_39); }
  if (ZXing.BarcodeFormat.EAN_13) { formats.push(ZXing.BarcodeFormat.EAN_13); }
  if (ZXing.BarcodeFormat.EAN_8) { formats.push(ZXing.BarcodeFormat.EAN_8); }
  if (ZXing.BarcodeFormat.UPC_A) { formats.push(ZXing.BarcodeFormat.UPC_A); }
  if (ZXing.BarcodeFormat.UPC_E) { formats.push(ZXing.BarcodeFormat.UPC_E); }
  if (ZXing.BarcodeFormat.QR_CODE) { formats.push(ZXing.BarcodeFormat.QR_CODE); }
  var hints = new Map();
  if (formats.length) {
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, formats);
  }
  if (tryHarder) {
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  }
  return hints;
}

function getNowMs_() {
  if (typeof performance !== 'undefined' && performance.now) {
    return performance.now();
  }
  return Date.now();
}

function round2_(value) {
  return Math.round(value * 100) / 100;
}
