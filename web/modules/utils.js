export function debounce(fn, wait) {
  var timeout;
  return function () {
    var args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(function () { fn.apply(null, args); }, wait);
  };
}

export function findAncestorWithAttr(el, attrName) {
  while (el && el !== document.documentElement) {
    if (el.hasAttribute && el.hasAttribute(attrName)) { return el; }
    el = el.parentNode;
  }
  return null;
}

export function triggerVibrate(ms) {
  try {
    if (navigator && typeof navigator.vibrate === 'function') {
      navigator.vibrate(ms);
    }
  } catch (e) {}
}

export function generateUuid() {
  var cryptoObj = (window && window.crypto) ? window.crypto : null;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  var bytes = new Uint8Array(16);
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  var hex = [];
  for (var b = 0; b < bytes.length; b++) {
    hex.push((bytes[b] + 0x100).toString(16).slice(1));
  }
  return (
    hex[0] + hex[1] + hex[2] + hex[3] + '-' +
    hex[4] + hex[5] + '-' +
    hex[6] + hex[7] + '-' +
    hex[8] + hex[9] + '-' +
    hex[10] + hex[11] + hex[12] + hex[13] + hex[14] + hex[15]
  );
}
