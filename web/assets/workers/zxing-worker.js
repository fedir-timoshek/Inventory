var state = {
  ready: false,
  options: null,
  wasmUrl: '',
  libUrl: ''
};

function initWorker(payload) {
  state.libUrl = payload.libUrl || '';
  state.wasmUrl = payload.wasmUrl || '';
  state.options = payload.options || {};
  if (!state.libUrl) {
    throw new Error('Missing ZXing library URL.');
  }
  importScripts(state.libUrl);
  if (!self.ZXingWASM) {
    throw new Error('ZXingWASM not available.');
  }
  if (typeof self.ZXingWASM.setZXingModuleOverrides === 'function' && state.wasmUrl) {
    self.ZXingWASM.setZXingModuleOverrides({
      locateFile: function () { return state.wasmUrl; }
    });
  }
  return warmup();
}

function warmup() {
  if (!self.ZXingWASM || typeof self.ZXingWASM.readBarcodesFromImageData !== 'function') {
    return Promise.resolve();
  }
  var blank = {
    data: new Uint8ClampedArray(4 * 10 * 10),
    width: 10,
    height: 10
  };
  return self.ZXingWASM.readBarcodesFromImageData(blank, state.options)
    .catch(function () { return null; });
}

function decodeFrame(payload) {
  if (!self.ZXingWASM || typeof self.ZXingWASM.readBarcodesFromImageData !== 'function') {
    return Promise.resolve(null);
  }
  var data = payload.data ? new Uint8ClampedArray(payload.data) : null;
  if (!data) { return Promise.resolve(null); }
  var image = { data: data, width: payload.width, height: payload.height };
  var started = Date.now();
  return self.ZXingWASM.readBarcodesFromImageData(image, state.options)
    .then(function (results) {
      if (!results || !results.length) { return null; }
      var hit = results[0];
      var points = null;
      if (hit.position) {
        points = [
          hit.position.topLeft,
          hit.position.topRight,
          hit.position.bottomRight,
          hit.position.bottomLeft
        ];
      }
      return {
        rawValue: hit.text || hit.rawValue || hit.data || '',
        format: hit.format || '',
        ts: Date.now(),
        points: points,
        meta: {
          durationMs: Date.now() - started
        }
      };
    })
    .catch(function () { return null; });
}

self.onmessage = function (evt) {
  var data = evt.data || {};
  if (data.type === 'init') {
    Promise.resolve()
      .then(function () { return initWorker(data); })
      .then(function () {
        state.ready = true;
        self.postMessage({ type: 'ready' });
      })
      .catch(function (err) {
        self.postMessage({ type: 'error', message: err ? err.message : 'Init failed.' });
      });
    return;
  }
  if (data.type === 'scan') {
    if (!state.ready) {
      self.postMessage({ type: 'result', requestId: data.requestId, result: null });
      return;
    }
    decodeFrame(data)
      .then(function (result) {
        self.postMessage({ type: 'result', requestId: data.requestId, result: result || null });
      })
      .catch(function (err) {
        self.postMessage({ type: 'error', requestId: data.requestId, message: err ? err.message : 'Decode failed.' });
      });
    return;
  }
  if (data.type === 'dispose') {
    self.close();
  }
};
