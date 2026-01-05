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
