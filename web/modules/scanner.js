import { appState, scannerState } from './state.js';
import { dom } from './dom.js';
import { showToast } from './toast.js';
import { triggerVibrate } from './utils.js';

export function initScannerSupport() {
  appState.cameraSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  if (!appState.cameraSupported) {
    setScanStatus('Camera scanning is not supported.', 'Idle');
    dom.cameraSupportMessage.classList.remove('hidden');
    if (dom.cameraSelectRow) { dom.cameraSelectRow.classList.add('hidden'); }
    updateScanButton();
    updateTorchUI();
    return;
  }
  dom.cameraSupportMessage.classList.add('hidden');
  updateScanButton();
  updateTorchUI();

  try {
    if (window.ZXing && ZXing.BrowserMultiFormatReader && typeof Promise !== 'undefined') {
      var tempReader = new ZXing.BrowserMultiFormatReader();
      tempReader.listVideoInputDevices()
        .then(function (devices) {
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
        })
        .catch(function () { dom.cameraSelectRow.classList.add('hidden'); });
    }
  } catch (e) {
    dom.cameraSelectRow.classList.add('hidden');
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
  if (appState.scanning) { return; }

  if (!(window.ZXing && ZXing.BrowserMultiFormatReader)) {
    setScanStatus('Scanner library failed to load.', 'Error');
    showToast('Barcode scanner library not available.', 'error');
    return;
  }

  if (!scannerState.codeReader) {
    scannerState.codeReader = new ZXing.BrowserMultiFormatReader();
  }

  appState.scanning = true;
  appState.torchSupported = null;
  appState.torchOn = false;
  updateTorchUI();
  updateScanButton();
  setScanStatus('Requesting camera…', 'Scanning');

  var deviceId = appState.selectedCameraId || undefined;
  try {
    var startPromise = scannerState.codeReader.decodeFromVideoDevice(deviceId, dom.video, function (result, err) {
      if (!appState.scanning) { return; }
      if (result) {
        var text = result.text || (result.getText ? result.getText() : '');
        onBarcodeDetected(text);
      } else if (err && err.name !== 'NotFoundException') { console.log('Decode error:', err); }
    });
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

export function stopScanner() {
  appState.scanning = false;
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
  if (!appState.cameraSupported) {
    dom.btnToggleTorch.disabled = true;
    dom.btnToggleTorch.textContent = '🔦 Flashlight';
    dom.torchHint.textContent = 'Not supported';
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
