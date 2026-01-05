export function handleLayoutChange() {
  var width = window.innerWidth || document.documentElement.clientWidth || 0;
  document.documentElement.classList.toggle('is-mobile', width < 860);
}
