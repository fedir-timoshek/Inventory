var state = {
  ready: false,
  libUrl: '',
  scanner: null
};

function initWorker(payload) {
  state.libUrl = payload.libUrl || '';
  if (!state.libUrl) {
    throw new Error('Missing ZBar library URL.');
  }
  importScripts(state.libUrl);
  if (!self.zbarWasm) {
    throw new Error('zbarWasm not available.');
  }
  return self.zbarWasm.getDefaultScanner()
    .then(function (scanner) {
      state.scanner = scanner;
      try {
        scanner.setConfig(self.zbarWasm.ZBarSymbolType.ZBAR_NONE, self.zbarWasm.ZBarConfigType.ZBAR_CFG_ENABLE, 0);
        scanner.setConfig(self.zbarWasm.ZBarSymbolType.ZBAR_CODE128, self.zbarWasm.ZBarConfigType.ZBAR_CFG_ENABLE, 1);
        scanner.setConfig(self.zbarWasm.ZBarSymbolType.ZBAR_CODE39, self.zbarWasm.ZBarConfigType.ZBAR_CFG_ENABLE, 1);
      } catch (e) {}
    });
}

function warmup() {
  if (!self.zbarWasm || !state.scanner) { return Promise.resolve(); }
  var blank = {
    data: new Uint8ClampedArray(4 * 10 * 10),
    width: 10,
    height: 10
  };
  return self.zbarWasm.scanImageData(blank, state.scanner)
    .catch(function () { return null; });
}

function decodeFrame(payload) {
  if (!self.zbarWasm || !state.scanner) {
    return Promise.resolve(null);
  }
  var data = payload.data ? new Uint8ClampedArray(payload.data) : null;
  if (!data) { return Promise.resolve(null); }
  var image = { data: data, width: payload.width, height: payload.height };
  var started = Date.now();
  return self.zbarWasm.scanImageData(image, state.scanner)
    .then(function (symbols) {
      if (!symbols || !symbols.length) { return null; }
      var hit = null;
      for (var i = 0; i < symbols.length; i++) {
        if (symbols[i] && (symbols[i].typeName === 'ZBAR_CODE128' || symbols[i].typeName === 'ZBAR_CODE39')) {
          hit = symbols[i];
          break;
        }
      }
      if (!hit) { hit = symbols[0]; }
      return {
        rawValue: hit.decode ? hit.decode() : '',
        format: hit.typeName || '',
        ts: Date.now(),
        points: hit.points || null,
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
      .then(function () { return warmup(); })
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
