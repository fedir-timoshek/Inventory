import { appState } from './state.js';
import { dom } from './dom.js';

export function handleImageFileChange(evt) {
  var input = evt.target || evt.srcElement;
  if (!input || !input.files || !input.files.length) { return; }
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function (e) {
    var dataUrl = e.target && e.target.result ? e.target.result : null;
    if (!dataUrl) { return; }
    appState.selectedImageDataUrl = dataUrl;
    dom.imagePreview.src = dataUrl;
    dom.imagePreview.classList.remove('hidden');
    dom.imagePlaceholder.classList.add('hidden');
    dom.removeImageButton.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

export function clearSelectedImage() {
  appState.selectedImageDataUrl = null;
  dom.imagePreview.src = '';
  dom.imagePreview.classList.add('hidden');
  dom.imagePlaceholder.classList.remove('hidden');
  dom.removeImageButton.classList.add('hidden');
  if (dom.takePhotoInput) { dom.takePhotoInput.value = ''; }
  if (dom.choosePhotoInput) { dom.choosePhotoInput.value = ''; }
}
