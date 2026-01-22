import { normalizeScanResult } from './scan-utils.js';

export function createScanManager(options) {
  return new ScanManager(options);
}

function ScanManager(options) {
  options = options || {};
  this.frameSource = options.frameSource;
  this.engines = options.engines || [];
  this.onResult = options.onResult || null;
  this.onTimeout = options.onTimeout || null;
  this.onError = options.onError || null;
  this.onStatus = options.onStatus || null;
  this.validationOptions = options.validationOptions || {};
  this.timeoutMs = (typeof options.timeoutMs === 'number') ? options.timeoutMs : 10000;
  this.cooldownMs = (typeof options.cooldownMs === 'number') ? options.cooldownMs : 1500;
  this.continuous = !!options.continuous;
  this.minIntervalMs = (typeof options.minIntervalMs === 'number') ? options.minIntervalMs : 90;
  this.maxIntervalMs = (typeof options.maxIntervalMs === 'number') ? options.maxIntervalMs : 220;
  this.roiStages = options.roiStages || [
    { width: 0.6, height: 0.25 },
    { width: 0.8, height: 0.45 },
    { width: 1.0, height: 1.0 }
  ];
  this.roiExpandMs = options.roiExpandMs || [2500, 5200];
  this._frameIntervalMs = this.minIntervalMs;
  this._active = false;
  this._sessionId = 0;
  this._startTs = 0;
  this._lastFrameTs = 0;
  this._lastSuccessTs = 0;
  this._lastResult = null;
  this._pausedUntil = 0;
  this._rafId = 0;
  this._timerId = 0;
  this._timeoutId = 0;
  this._engineRunners = [];
  this._frameId = 0;
  this._abortController = null;
}

ScanManager.prototype.start = function (options) {
  var self = this;
  options = options || {};
  if (self._active) {
    return Promise.resolve();
  }
  if (!self.frameSource || !self.engines.length) {
    return Promise.reject(new Error('Scanner not configured.'));
  }
  self._active = true;
  self._sessionId += 1;
  self._startTs = Date.now();
  self._lastSuccessTs = self._startTs;
  self._frameIntervalMs = self.minIntervalMs;
  self._frameId = 0;
  self._lastResult = null;
  self._pausedUntil = 0;
  self._abortController = (typeof AbortController !== 'undefined') ? new AbortController() : null;

  var preparePromises = self.engines.map(function (engine) {
    if (!engine) {
      return Promise.resolve();
    }
    engine._disabled = false;
    if (typeof engine.prepare !== 'function') {
      return Promise.resolve();
    }
    return Promise.resolve()
      .then(function () { return engine.prepare(options); })
      .catch(function (err) {
        engine._disabled = true;
        if (self.onStatus) {
          self.onStatus({ engineId: engine.id || '', error: err, stage: 'prepare' });
        }
      });
  });

  return Promise.all(preparePromises)
    .then(function () {
      if (!self._active) { return; }
      var activeEngines = self.engines.filter(function (engine) {
        return engine && !engine._disabled;
      });
      if (!activeEngines.length) {
        throw new Error('No scanner engines available.');
      }
      return self.frameSource.start(options.deviceId || '');
    })
    .then(function () {
      if (!self._active) { return; }
      var activeEngines = self.engines.filter(function (engine) {
        return engine && !engine._disabled;
      });
      self._engineRunners = activeEngines.map(function (engine) {
        return new EngineRunner(engine, self);
      });
      self._scheduleNextTick();
      if (self.timeoutMs > 0) {
        self._timeoutId = setTimeout(function () {
          if (self._active) {
            self._handleTimeout();
          }
        }, self.timeoutMs);
      }
    })
    .catch(function (err) {
      self._handleError(err);
      throw err;
    });
};

ScanManager.prototype.stop = function () {
  var self = this;
  if (!self._active) { return Promise.resolve(); }
  self._active = false;
  if (self._abortController) {
    try { self._abortController.abort(); } catch (e) {}
  }
  self._abortController = null;
  if (self._timeoutId) {
    clearTimeout(self._timeoutId);
    self._timeoutId = 0;
  }
  if (self._rafId) {
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(self._rafId);
    }
    self._rafId = 0;
  }
  if (self._timerId) {
    clearTimeout(self._timerId);
    self._timerId = 0;
  }
  self._engineRunners = [];

  var disposePromises = self.engines.map(function (engine) {
    if (!engine || typeof engine.dispose !== 'function') {
      return Promise.resolve();
    }
    return Promise.resolve(engine.dispose());
  });

  return Promise.all(disposePromises)
    .then(function () {
      if (self.frameSource && typeof self.frameSource.stop === 'function') {
        self.frameSource.stop();
      }
    });
};

ScanManager.prototype.isActive = function () {
  return this._active;
};

ScanManager.prototype._handleResult = function (rawResult) {
  if (!this._active) { return; }
  var result = normalizeScanResult(rawResult, this.validationOptions);
  if (!result) { return; }
  var now = Date.now();
  if (this._lastResult && this._lastResult.value === result.rawValue && (now - this._lastResult.ts) < this.cooldownMs) {
    return;
  }
  this._lastResult = { value: result.rawValue, ts: now };
  this._lastSuccessTs = now;
  if (this.onResult) {
    this.onResult(result, { elapsedMs: now - this._startTs });
  }
  if (!this.continuous) {
    this.stop();
  } else {
    this._pausedUntil = now + this.cooldownMs;
  }
};

ScanManager.prototype._handleTimeout = function () {
  if (!this._active) { return; }
  this.stop();
  if (this.onTimeout) {
    this.onTimeout({ elapsedMs: Date.now() - this._startTs });
  }
};

ScanManager.prototype._handleError = function (err) {
  if (this.onError) {
    this.onError(err);
  }
  if (this._active) {
    this.stop();
  }
};

ScanManager.prototype._scheduleNextTick = function () {
  var self = this;
  if (!self._active) { return; }
  if (typeof requestAnimationFrame === 'function') {
    self._rafId = requestAnimationFrame(function () { self._tick(); });
  } else {
    self._timerId = setTimeout(function () { self._tick(); }, self._frameIntervalMs);
  }
};

ScanManager.prototype._tick = function () {
  if (!this._active) { return; }
  var now = Date.now();
  if (this._pausedUntil && now < this._pausedUntil) {
    this._scheduleNextTick();
    return;
  }
  if (now - this._lastFrameTs < this._frameIntervalMs) {
    this._scheduleNextTick();
    return;
  }

  var roi = this._computeRoi(now);
  var frame = this.frameSource.captureFrame(roi);
  if (frame) {
    frame.frameId = ++this._frameId;
    frame.roiStage = roi.stage;
    this._dispatchFrame(frame);
    this._lastFrameTs = now;
  }
  this._updateInterval();
  this._scheduleNextTick();
};

ScanManager.prototype._computeRoi = function (now) {
  var elapsed = now - this._lastSuccessTs;
  var stage = 0;
  if (elapsed > this.roiExpandMs[1]) {
    stage = 2;
  } else if (elapsed > this.roiExpandMs[0]) {
    stage = 1;
  }
  var target = this.roiStages[stage] || { width: 1, height: 1 };
  return {
    x: (1 - target.width) / 2,
    y: (1 - target.height) / 2,
    width: target.width,
    height: target.height,
    stage: stage
  };
};

ScanManager.prototype._dispatchFrame = function (frame) {
  for (var i = 0; i < this._engineRunners.length; i++) {
    this._engineRunners[i].submit(frame);
  }
};

ScanManager.prototype._updateInterval = function () {
  var busyCount = 0;
  for (var i = 0; i < this._engineRunners.length; i++) {
    if (this._engineRunners[i].isBusy()) {
      busyCount++;
    }
  }
  if (busyCount > 0) {
    this._frameIntervalMs = Math.min(this._frameIntervalMs + 12, this.maxIntervalMs);
  } else {
    this._frameIntervalMs = Math.max(this._frameIntervalMs - 8, this.minIntervalMs);
  }
};

function EngineRunner(engine, manager) {
  this.engine = engine;
  this.manager = manager;
  this.busy = false;
  this.pendingFrame = null;
  this.lastScanTs = 0;
}

EngineRunner.prototype.isBusy = function () {
  return this.busy || !!this.pendingFrame;
};

EngineRunner.prototype.submit = function (frame) {
  var self = this;
  var now = Date.now();
  if (!self.manager._active) { return; }
  if (self.busy) {
    self.pendingFrame = frame;
    return;
  }
  if (self.engine && self.engine.minIntervalMs && (now - self.lastScanTs) < self.engine.minIntervalMs) {
    self.pendingFrame = frame;
    return;
  }
  self.busy = true;
  self.lastScanTs = now;
  var currentSession = self.manager._sessionId;
  Promise.resolve()
    .then(function () {
      return self.engine.scanFrame(frame, {
        signal: self.manager._abortController ? self.manager._abortController.signal : null
      });
    })
    .then(function (result) {
      if (!self.manager._active || currentSession !== self.manager._sessionId) {
        return;
      }
      if (result) {
        self.manager._handleResult(result);
      }
    })
    .catch(function (err) {
      if (self.manager.onStatus) {
        self.manager.onStatus({ engineId: self.engine.id, error: err });
      }
    })
    .finally(function () {
      self.busy = false;
      if (self.pendingFrame && self.manager._active) {
        var pending = self.pendingFrame;
        self.pendingFrame = null;
        self.submit(pending);
      }
    });
};
