import { createScanManager } from '../modules/scanner/scan-manager.js';

var resultsEl = document.getElementById('testResults');

function logResult(name, passed, error) {
  var row = document.createElement('div');
  row.className = 'test-row ' + (passed ? 'test-pass' : 'test-fail');
  row.textContent = (passed ? 'PASS: ' : 'FAIL: ') + name + (error ? ' - ' + error : '');
  resultsEl.appendChild(row);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function createMockFrameSource() {
  var active = false;
  return {
    start: function () { active = true; return Promise.resolve(); },
    stop: function () { active = false; },
    captureFrame: function () {
      if (!active) { return null; }
      return {
        imageData: { data: new Uint8ClampedArray(4), width: 1, height: 1 },
        width: 1,
        height: 1,
        roiStage: 0,
        scale: 1,
        canvas: null
      };
    }
  };
}

function createMockEngine(id, delayMs, resultValue) {
  return {
    id: id,
    name: id,
    minIntervalMs: 0,
    prepare: function () { return Promise.resolve(); },
    scanFrame: function () {
      if (!resultValue) { return Promise.resolve(null); }
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve({
            rawValue: resultValue,
            format: 'code_128',
            engineId: id,
            ts: Date.now()
          });
        }, delayMs);
      });
    },
    dispose: function () { return Promise.resolve(); }
  };
}

async function testFirstSuccessWins() {
  var frameSource = createMockFrameSource();
  var engineFast = createMockEngine('fast', 40, 'FAST-OK');
  var engineSlow = createMockEngine('slow', 120, 'SLOW-OK');
  var result = null;

  var manager = createScanManager({
    frameSource: frameSource,
    engines: [engineSlow, engineFast],
    timeoutMs: 500,
    onResult: function (res) { result = res; }
  });
  await manager.start();
  await new Promise(function (resolve) { setTimeout(resolve, 200); });

  assert(result, 'Expected a scan result');
  assert(result.engineId === 'fast', 'Expected fast engine to win');
  await manager.stop();
}

async function testTimeoutStops() {
  var frameSource = createMockFrameSource();
  var engine = createMockEngine('none', 0, '');
  var timedOut = false;
  var manager = createScanManager({
    frameSource: frameSource,
    engines: [engine],
    timeoutMs: 120,
    onTimeout: function () { timedOut = true; }
  });
  await manager.start();
  await new Promise(function (resolve) { setTimeout(resolve, 200); });

  assert(timedOut, 'Expected timeout to trigger');
  assert(!manager.isActive(), 'Expected manager to stop after timeout');
}

async function testStopReleases() {
  var frameSource = createMockFrameSource();
  var disposed = false;
  var engine = {
    id: 'engine',
    name: 'engine',
    minIntervalMs: 0,
    prepare: function () { return Promise.resolve(); },
    scanFrame: function () { return Promise.resolve(null); },
    dispose: function () { disposed = true; return Promise.resolve(); }
  };
  var manager = createScanManager({
    frameSource: frameSource,
    engines: [engine],
    timeoutMs: 500
  });
  await manager.start();
  await manager.stop();
  assert(disposed, 'Expected engine dispose to run');
}

async function testCancelStopsResults() {
  var frameSource = createMockFrameSource();
  var gotResult = false;
  var engine = createMockEngine('delayed', 200, 'LATE');
  var manager = createScanManager({
    frameSource: frameSource,
    engines: [engine],
    timeoutMs: 500,
    onResult: function () { gotResult = true; }
  });
  await manager.start();
  await manager.stop();
  await new Promise(function (resolve) { setTimeout(resolve, 260); });
  assert(!gotResult, 'Expected no result after stop');
}

async function runTests() {
  var tests = [
    { name: 'First Success Wins', fn: testFirstSuccessWins },
    { name: 'Timeout Stops Manager', fn: testTimeoutStops },
    { name: 'Stop Releases Engines', fn: testStopReleases },
    { name: 'Cancel Prevents Late Results', fn: testCancelStopsResults }
  ];
  for (var i = 0; i < tests.length; i++) {
    var test = tests[i];
    try {
      await test.fn();
      logResult(test.name, true);
    } catch (err) {
      logResult(test.name, false, err && err.message ? err.message : 'Unknown error');
    }
  }
}

runTests();
