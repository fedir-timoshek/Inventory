import { loadScriptOnce, resolveAssetUrl, cloneImageData } from './scan-utils.js';

var FORMAT_LIST = ['code_128', 'code_39'];
var ZXING_FORMATS = ['Code128', 'Code39'];
var QUAGGA_READERS = ['code_128_reader', 'code_39_reader'];

function intersectFormats(supported, desired) {
  if (!supported || !supported.length) { return desired.slice(); }
  var set = {};
  for (var i = 0; i < supported.length; i++) {
    set[String(supported[i]).toLowerCase()] = true;
  }
  var result = [];
  for (var j = 0; j < desired.length; j++) {
    if (set[String(desired[j]).toLowerCase()]) {
      result.push(desired[j]);
    }
  }
  return result;
}

function createWorkerClient(url, initMessage) {
  var worker = new Worker(url);
  var pending = {};
  var seq = 0;
  var readyResolve;
  var readyReject;
  var readySettled = false;
  var readyPromise = new Promise(function (resolve, reject) {
    readyResolve = resolve;
    readyReject = reject;
  });

  function settleReady(fn, arg) {
    if (readySettled) { return; }
    readySettled = true;
    fn(arg);
  }

  worker.onmessage = function (evt) {
    var data = evt.data || {};
    if (data.type === 'ready') {
      settleReady(readyResolve);
      return;
    }
    if (data.type === 'result') {
      if (pending[data.requestId]) {
        pending[data.requestId].resolve(data.result || null);
        delete pending[data.requestId];
      }
      return;
    }
    if (data.type === 'error') {
      if (pending[data.requestId]) {
        pending[data.requestId].reject(new Error(data.message || 'Worker error.'));
        delete pending[data.requestId];
      } else {
        settleReady(readyReject, new Error(data.message || 'Worker error.'));
      }
      return;
    }
  };

  worker.onerror = function (err) {
    settleReady(readyReject, err);
  };

  worker.postMessage(initMessage);

  return {
    ready: readyPromise,
    request: function (payload, transfer) {
      var requestId = ++seq;
      var message = { type: 'scan', requestId: requestId };
      for (var key in payload) {
        message[key] = payload[key];
      }
      return new Promise(function (resolve, reject) {
        pending[requestId] = { resolve: resolve, reject: reject };
        worker.postMessage(message, transfer || []);
      });
    },
    dispose: function () {
      worker.terminate();
      pending = {};
    }
  };
}

function createNativeBarcodeDetectorEngine(capabilities) {
  var detector = null;
  var formats = intersectFormats(capabilities.barcodeDetectorFormats, FORMAT_LIST);
  return {
    id: 'barcode-detector',
    name: 'BarcodeDetector',
    minIntervalMs: 90,
    prepare: function () {
      detector = new BarcodeDetector({ formats: formats });
    },
    scanFrame: function (frame) {
      if (!detector || !frame || !frame.imageData) { return Promise.resolve(null); }
      var started = Date.now();
      return detector.detect(frame.imageData)
        .then(function (barcodes) {
          if (!barcodes || !barcodes.length) { return null; }
          var hit = barcodes[0];
          return {
            rawValue: hit.rawValue || hit.data || hit.displayValue || '',
            format: hit.format || '',
            engineId: 'barcode-detector',
            ts: Date.now(),
            bbox: hit.boundingBox || null,
            points: hit.cornerPoints || null,
            meta: {
              durationMs: Date.now() - started,
              roiStage: frame.roiStage || 0,
              scale: frame.scale || 1
            }
          };
        })
        .catch(function () { return null; });
    },
    dispose: function () {
      detector = null;
    }
  };
}

function createBarcodeDetectorPonyfillEngine() {
  var detector = null;
  var prepared = false;
  var libUrl = resolveAssetUrl('assets/vendor/barcode-detector-ponyfill.js');
  var wasmUrl = resolveAssetUrl('assets/wasm/zxing_reader.wasm');
  return {
    id: 'barcode-detector-ponyfill',
    name: 'BarcodeDetector Ponyfill',
    minIntervalMs: 110,
    prepare: function () {
      if (prepared) { return Promise.resolve(); }
      return loadScriptOnce(libUrl)
        .then(function () {
          if (!window.BarcodeDetectionAPI || !window.BarcodeDetectionAPI.BarcodeDetector) {
            throw new Error('BarcodeDetector ponyfill not available.');
          }
          if (window.BarcodeDetectionAPI.setZXingModuleOverrides) {
            window.BarcodeDetectionAPI.setZXingModuleOverrides({
              locateFile: function () { return wasmUrl; }
            });
          }
          detector = new window.BarcodeDetectionAPI.BarcodeDetector({ formats: FORMAT_LIST });
          prepared = true;
        });
    },
    scanFrame: function (frame) {
      if (!detector || !frame || !frame.imageData) { return Promise.resolve(null); }
      var started = Date.now();
      return detector.detect(frame.imageData)
        .then(function (barcodes) {
          if (!barcodes || !barcodes.length) { return null; }
          var hit = barcodes[0];
          return {
            rawValue: hit.rawValue || hit.data || hit.displayValue || '',
            format: hit.format || '',
            engineId: 'barcode-detector-ponyfill',
            ts: Date.now(),
            bbox: hit.boundingBox || null,
            points: hit.cornerPoints || null,
            meta: {
              durationMs: Date.now() - started,
              roiStage: frame.roiStage || 0,
              scale: frame.scale || 1
            }
          };
        })
        .catch(function () { return null; });
    },
    dispose: function () {
      detector = null;
    }
  };
}

function createZXingWorkerEngine() {
  var client = null;
  var libUrl = resolveAssetUrl('assets/vendor/zxing-wasm-reader.js');
  var wasmUrl = resolveAssetUrl('assets/wasm/zxing_reader.wasm');
  var workerUrl = resolveAssetUrl('assets/workers/zxing-worker.js');
  var readerOptions = {
    formats: ZXING_FORMATS.slice(),
    tryHarder: true,
    tryRotate: true,
    tryInvert: true,
    tryDownscale: true,
    tryDenoise: false,
    maxNumberOfSymbols: 1,
    downscaleFactor: 3
  };
  return {
    id: 'zxing-wasm',
    name: 'ZXing WASM',
    minIntervalMs: 80,
    prepare: function () {
      if (!client) {
        client = createWorkerClient(workerUrl, {
          type: 'init',
          libUrl: libUrl,
          wasmUrl: wasmUrl,
          options: readerOptions
        });
      }
      return client.ready;
    },
    scanFrame: function (frame) {
      if (!client || !frame || !frame.imageData) { return Promise.resolve(null); }
      var clone = cloneImageData(frame.imageData);
      if (!clone) { return Promise.resolve(null); }
      var payload = {
        width: clone.width,
        height: clone.height,
        data: clone.data.buffer,
        meta: { roiStage: frame.roiStage || 0, scale: frame.scale || 1 }
      };
      return client.request(payload, [payload.data])
        .then(function (result) {
          if (!result) { return null; }
          result.engineId = 'zxing-wasm';
          result.meta = result.meta || {};
          result.meta.roiStage = frame.roiStage || 0;
          result.meta.scale = frame.scale || 1;
          return result;
        })
        .catch(function () { return null; });
    },
    dispose: function () {
      if (client) {
        client.dispose();
        client = null;
      }
    }
  };
}

function createZBarWorkerEngine() {
  var client = null;
  var libUrl = resolveAssetUrl('assets/vendor/zbar-wasm-inlined.js');
  var workerUrl = resolveAssetUrl('assets/workers/zbar-worker.js');
  return {
    id: 'zbar-wasm',
    name: 'ZBar WASM',
    minIntervalMs: 70,
    prepare: function () {
      if (!client) {
        client = createWorkerClient(workerUrl, {
          type: 'init',
          libUrl: libUrl
        });
      }
      return client.ready;
    },
    scanFrame: function (frame) {
      if (!client || !frame || !frame.imageData) { return Promise.resolve(null); }
      var clone = cloneImageData(frame.imageData);
      if (!clone) { return Promise.resolve(null); }
      var payload = {
        width: clone.width,
        height: clone.height,
        data: clone.data.buffer,
        meta: { roiStage: frame.roiStage || 0, scale: frame.scale || 1 }
      };
      return client.request(payload, [payload.data])
        .then(function (result) {
          if (!result) { return null; }
          result.engineId = 'zbar-wasm';
          result.meta = result.meta || {};
          result.meta.roiStage = frame.roiStage || 0;
          result.meta.scale = frame.scale || 1;
          return result;
        })
        .catch(function () { return null; });
    },
    dispose: function () {
      if (client) {
        client.dispose();
        client = null;
      }
    }
  };
}

function createQuaggaEngine() {
  var prepared = false;
  var libUrl = resolveAssetUrl('assets/vendor/quagga.min.js');
  return {
    id: 'quagga2',
    name: 'Quagga2',
    minIntervalMs: 520,
    prepare: function () {
      if (prepared) { return Promise.resolve(); }
      return loadScriptOnce(libUrl).then(function () {
        prepared = true;
      });
    },
    scanFrame: function (frame) {
      if (!prepared || !window.Quagga || !frame || !frame.canvas) { return Promise.resolve(null); }
      var started = Date.now();
      var dataUrl = frame.canvas.toDataURL('image/png');
      return window.Quagga.decodeSingle({
        src: dataUrl,
        locate: true,
        decoder: { readers: QUAGGA_READERS },
        inputStream: { size: Math.max(frame.width, frame.height) }
      })
        .then(function (result) {
          if (!result || !result.codeResult || !result.codeResult.code) { return null; }
          return {
            rawValue: result.codeResult.code,
            format: result.codeResult.format || '',
            engineId: 'quagga2',
            ts: Date.now(),
            bbox: result.box || null,
            points: result.line || null,
            meta: {
              durationMs: Date.now() - started,
              roiStage: frame.roiStage || 0,
              scale: frame.scale || 1
            }
          };
        })
        .catch(function () { return null; });
    },
    dispose: function () {}
  };
}

function createHtml5QrcodeEngine() {
  var prepared = false;
  var instance = null;
  var containerId = 'html5QrcodeHidden';
  var libUrl = resolveAssetUrl('assets/vendor/html5-qrcode.min.js');
  function dataUrlToBlob(dataUrl) {
    var parts = dataUrl.split(',');
    if (parts.length < 2) { return null; }
    var header = parts[0];
    var base64 = parts[1];
    var match = header.match(/data:([^;]+);base64/);
    var mime = match ? match[1] : 'image/png';
    var binary = atob(base64);
    var length = binary.length;
    var buffer = new Uint8Array(length);
    for (var i = 0; i < length; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return new Blob([buffer], { type: mime });
  }
  return {
    id: 'html5-qrcode',
    name: 'html5-qrcode',
    minIntervalMs: 900,
    prepare: function () {
      if (prepared) { return Promise.resolve(); }
      return loadScriptOnce(libUrl)
        .then(function () {
          if (!window.Html5Qrcode) {
            throw new Error('Html5Qrcode not available.');
          }
          var container = document.getElementById(containerId);
          if (!container) {
            container = document.createElement('div');
            container.id = containerId;
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            container.style.top = '-9999px';
            container.style.width = '10px';
            container.style.height = '10px';
            document.body.appendChild(container);
          }
          instance = new window.Html5Qrcode(containerId, {
            formatsToSupport: [
              window.Html5QrcodeSupportedFormats.CODE_128,
              window.Html5QrcodeSupportedFormats.CODE_39
            ],
            useBarCodeDetectorIfSupported: false,
            verbose: false
          });
          prepared = true;
        });
    },
    scanFrame: function (frame) {
      if (!prepared || !instance || !frame || !frame.canvas || typeof File !== 'function') { return Promise.resolve(null); }
      var started = Date.now();
      return new Promise(function (resolve) {
        var blobHandler = function (blob) {
          if (!blob) { resolve(null); return; }
          var file = new File([blob], 'frame.png', { type: 'image/png' });
          instance.scanFileV2(file, false)
            .then(function (result) {
              resolve({
                rawValue: result && result.decodedText ? result.decodedText : '',
                format: (result && result.result && result.result.format) ? result.result.format : '',
                engineId: 'html5-qrcode',
                ts: Date.now(),
                meta: {
                  durationMs: Date.now() - started,
                  roiStage: frame.roiStage || 0,
                  scale: frame.scale || 1
                }
              });
            })
            .catch(function () { resolve(null); });
        };
        if (typeof frame.canvas.toBlob === 'function') {
          frame.canvas.toBlob(blobHandler, 'image/png', 0.92);
        } else {
          var dataUrl = frame.canvas.toDataURL('image/png');
          blobHandler(dataUrlToBlob(dataUrl));
        }
      });
    },
    dispose: function () {
      if (instance && typeof instance.clear === 'function') {
        instance.clear();
      }
      instance = null;
    }
  };
}

export function getEngineRegistry() {
  return [
    {
      id: 'barcode-detector',
      name: 'BarcodeDetector',
      isSupported: function (cap) {
        if (!cap.hasBarcodeDetector) { return false; }
        if (cap.barcodeDetectorFormats && cap.barcodeDetectorFormats.length) {
          return intersectFormats(cap.barcodeDetectorFormats, FORMAT_LIST).length > 0;
        }
        return true;
      },
      create: function (cap) { return createNativeBarcodeDetectorEngine(cap); }
    },
    {
      id: 'barcode-detector-ponyfill',
      name: 'BarcodeDetector Ponyfill',
      isSupported: function (cap) { return !!cap.hasWasm && !cap.hasBarcodeDetector; },
      create: function () { return createBarcodeDetectorPonyfillEngine(); }
    },
    {
      id: 'zxing-wasm',
      name: 'ZXing WASM',
      isSupported: function (cap) { return !!cap.hasWasm && !!cap.hasWorkers; },
      create: function () { return createZXingWorkerEngine(); }
    },
    {
      id: 'zbar-wasm',
      name: 'ZBar WASM',
      isSupported: function (cap) { return !!cap.hasWasm && !!cap.hasWorkers; },
      create: function () { return createZBarWorkerEngine(); }
    },
    {
      id: 'quagga2',
      name: 'Quagga2',
      isSupported: function (cap) { return !!cap.hasDocument; },
      create: function () { return createQuaggaEngine(); }
    },
    {
      id: 'html5-qrcode',
      name: 'html5-qrcode',
      isSupported: function (cap) { return !!cap.hasDocument && !!cap.hasFileConstructor; },
      create: function () { return createHtml5QrcodeEngine(); }
    }
  ];
}

export function createSupportedEngines(capabilities) {
  var registry = getEngineRegistry();
  var supported = [];
  for (var i = 0; i < registry.length; i++) {
    var entry = registry[i];
    if (entry.isSupported(capabilities)) {
      supported.push(entry.create(capabilities));
    }
  }
  return supported;
}
