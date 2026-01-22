var scriptCache = {};

export function resolveAssetUrl(path) {
  try {
    return new URL(path, document.baseURI).toString();
  } catch (e) {
    return path;
  }
}

export function loadScriptOnce(url) {
  if (!url) {
    return Promise.reject(new Error('Missing script URL.'));
  }
  if (scriptCache[url]) {
    return scriptCache[url];
  }
  scriptCache[url] = new Promise(function (resolve, reject) {
    var existing = document.querySelector('script[data-src="' + url + '"]');
    if (existing && existing.dataset && existing.dataset.loaded === 'true') {
      resolve();
      return;
    }
    if (existing) {
      existing.addEventListener('load', function () { resolve(); });
      existing.addEventListener('error', function () { reject(new Error('Failed to load script.')); });
      return;
    }
    var script = document.createElement('script');
    script.async = true;
    script.dataset.src = url;
    script.onload = function () {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = function () { reject(new Error('Failed to load script.')); };
    script.src = url;
    document.head.appendChild(script);
  });
  return scriptCache[url];
}

export function cloneImageData(imageData) {
  if (!imageData || !imageData.data) {
    return null;
  }
  var dataCopy = new Uint8ClampedArray(imageData.data);
  return {
    data: dataCopy,
    width: imageData.width,
    height: imageData.height
  };
}

export function normalizeFormat(format) {
  if (!format) { return ''; }
  var key = String(format).replace(/[^a-z0-9]/gi, '_').toLowerCase();
  if (key === 'code128' || key === 'code_128' || key === 'zbar_code128') { return 'code_128'; }
  if (key === 'code39' || key === 'code_39' || key === 'zbar_code39') { return 'code_39'; }
  return key;
}

function normalizeRawValue(value) {
  if (!value) { return ''; }
  var text = String(value);
  text = text.replace(/\u0000/g, '');
  text = text.replace(/[\r\n]+/g, ' ');
  return text.trim();
}

function normalizeCode39(value, options) {
  if (!value) { return ''; }
  var cleaned = value.replace(/^\*+|\*+$/g, '');
  cleaned = cleaned.replace(/\s+/g, '');
  cleaned = cleaned.toUpperCase();
  var allowed = /^[0-9A-Z\-\.\ \$\/\+\%]*$/;
  if (!allowed.test(cleaned)) { return ''; }
  var minLen = (options && options.code39MinLen) ? options.code39MinLen : 3;
  var maxLen = (options && options.code39MaxLen) ? options.code39MaxLen : 64;
  if (cleaned.length < minLen || cleaned.length > maxLen) { return ''; }
  return cleaned;
}

function normalizeCode128(value, options) {
  if (!value) { return ''; }
  var cleaned = value.trim();
  var minLen = (options && options.code128MinLen) ? options.code128MinLen : 4;
  var maxLen = (options && options.code128MaxLen) ? options.code128MaxLen : 80;
  if (cleaned.length < minLen || cleaned.length > maxLen) { return ''; }
  return cleaned;
}

function looksLikeCode39(value) {
  if (!value) { return false; }
  return /^[0-9A-Z\-\.\ \$\/\+\%\*]+$/i.test(value);
}

export function normalizeScanResult(result, options) {
  if (!result) { return null; }
  var rawValue = normalizeRawValue(result.rawValue || result.text || result.data || '');
  if (!rawValue) { return null; }
  var format = normalizeFormat(result.format || result.formatName || result.type);
  var normalized = '';
  if (format === 'code_39') {
    normalized = normalizeCode39(rawValue, options);
    if (!normalized) { return null; }
    rawValue = normalized;
  } else if (format === 'code_128') {
    normalized = normalizeCode128(rawValue, options);
    if (!normalized) { return null; }
    rawValue = normalized;
  } else if (looksLikeCode39(rawValue)) {
    normalized = normalizeCode39(rawValue, options);
    if (normalized) {
      format = 'code_39';
      rawValue = normalized;
    }
  } else {
    normalized = normalizeCode128(rawValue, options);
    if (!normalized) { return null; }
    if (!format) { format = 'code_128'; }
    rawValue = normalized;
  }
  return {
    rawValue: rawValue,
    format: format || '',
    engineId: result.engineId || '',
    ts: result.ts || Date.now(),
    bbox: result.bbox || null,
    points: result.points || null,
    meta: result.meta || null
  };
}
