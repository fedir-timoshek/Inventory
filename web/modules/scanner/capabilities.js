function getUserAgent() {
  return (navigator && navigator.userAgent) ? navigator.userAgent : '';
}

function getPlatformHint() {
  if (navigator && navigator.userAgentData && navigator.userAgentData.platform) {
    return navigator.userAgentData.platform;
  }
  return (navigator && navigator.platform) ? navigator.platform : '';
}

function detectBrowserHint() {
  var ua = getUserAgent().toLowerCase();
  if (ua.indexOf('safari') > -1 && ua.indexOf('chrome') === -1 && ua.indexOf('crios') === -1) {
    return 'Safari';
  }
  if (ua.indexOf('firefox') > -1) {
    return 'Firefox';
  }
  if (ua.indexOf('edg') > -1) {
    return 'Edge';
  }
  if (ua.indexOf('chrome') > -1 || ua.indexOf('crios') > -1) {
    return 'Chrome';
  }
  return 'Unknown';
}

function extractDeviceModel(ua) {
  if (!ua) { return ''; }
  if (/iPhone/i.test(ua)) { return 'iPhone'; }
  if (/iPad/i.test(ua)) { return 'iPad'; }
  if (/iPod/i.test(ua)) { return 'iPod'; }
  var androidMatch = ua.match(/Android\s[\d.]+;\s*([^;)]*?)\s*Build/i);
  if (androidMatch && androidMatch[1]) {
    return androidMatch[1].trim();
  }
  return '';
}

function detectPlatformHint() {
  var ua = getUserAgent();
  var platform = getPlatformHint();
  if (/Android/i.test(ua)) { return 'Android'; }
  if (/iPad|iPhone|iPod/i.test(ua)) { return 'iOS'; }
  if (platform === 'MacIntel' && navigator && navigator.maxTouchPoints > 1) { return 'iPadOS'; }
  if (/Win/i.test(platform)) { return 'Windows'; }
  if (/Mac/i.test(platform)) { return 'macOS'; }
  if (/Linux/i.test(platform)) { return 'Linux'; }
  return platform || 'Unknown';
}

export function detectCapabilities() {
  var hasMediaDevices = !!(navigator && navigator.mediaDevices);
  var hasGetUserMedia = !!(navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  var hasWorkers = (typeof Worker === 'function');
  var hasOffscreenCanvas = (typeof OffscreenCanvas === 'function');
  var hasWasm = (typeof WebAssembly === 'object');
  var hasImageBitmap = (typeof createImageBitmap === 'function');
  var hasBarcodeDetector = (typeof BarcodeDetector === 'function');
  var hasDocument = (typeof document !== 'undefined');
  var hasFileConstructor = (typeof File === 'function');
  var uaData = (navigator && navigator.userAgentData) ? navigator.userAgentData : null;
  var torchPossible = false;
  try {
    torchPossible = !!(typeof MediaStreamTrack !== 'undefined' && MediaStreamTrack.prototype &&
      (MediaStreamTrack.prototype.getCapabilities || MediaStreamTrack.prototype.applyConstraints));
  } catch (e) {}

  var formatPromise = hasBarcodeDetector && typeof BarcodeDetector.getSupportedFormats === 'function'
    ? BarcodeDetector.getSupportedFormats()
    : Promise.resolve([]);
  var uaPromise = uaData && typeof uaData.getHighEntropyValues === 'function'
    ? uaData.getHighEntropyValues(['model', 'platformVersion']).catch(function () { return {}; })
    : Promise.resolve({});

  return Promise.all([
    Promise.resolve(formatPromise).catch(function () { return []; }),
    Promise.resolve(uaPromise)
  ]).then(function (values) {
    var formats = values[0];
    var uaInfo = values[1] || {};
    var deviceModel = uaInfo.model ? String(uaInfo.model) : '';
    if (!deviceModel) {
      deviceModel = extractDeviceModel(getUserAgent());
    }
    var platformVersion = uaInfo.platformVersion ? String(uaInfo.platformVersion) : '';
    return {
      userAgentHint: getUserAgent(),
      platformHint: detectPlatformHint(),
      platformVersion: platformVersion,
      browserHint: detectBrowserHint(),
      deviceModel: deviceModel,
      hasMediaDevices: hasMediaDevices,
      hasGetUserMedia: hasGetUserMedia,
      hasWorkers: hasWorkers,
      hasOffscreenCanvas: hasOffscreenCanvas,
      hasWasm: hasWasm,
      hasImageBitmap: hasImageBitmap,
      hasBarcodeDetector: hasBarcodeDetector,
      barcodeDetectorFormats: Array.isArray(formats) ? formats : [],
      hasDocument: hasDocument,
      hasFileConstructor: hasFileConstructor,
      torchPossible: torchPossible
    };
  });
}
