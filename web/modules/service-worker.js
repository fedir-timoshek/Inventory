export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) { return; }
  navigator.serviceWorker.register('./sw.js')
    .catch(function (err) {
      console.log('Service worker registration failed:', err);
    });
}
