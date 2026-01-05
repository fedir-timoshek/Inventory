import { dom } from './dom.js';

export function showToast(message, type) {
  if (!dom.toastContainer) { return; }
  var toast = document.createElement('div');
  var cls = 'toast';
  if (type === 'success') { cls += ' toast-success'; }
  else if (type === 'error') { cls += ' toast-error'; }
  else { cls += ' toast-info'; }
  toast.className = cls;
  toast.textContent = message;
  dom.toastContainer.appendChild(toast);
  setTimeout(function () {
    toast.classList.add('toast-hide');
    setTimeout(function () {
      if (toast.parentNode) { toast.parentNode.removeChild(toast); }
    }, 260);
  }, 2600);
}
