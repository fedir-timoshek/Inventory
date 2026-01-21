import { appState } from './state.js';
import { dom } from './dom.js';
import { showToast } from './toast.js';

var IMAGE_MAX_DIMENSION = 2000;
var IMAGE_TARGET_MAX_BYTES = 900 * 1024;
var IMAGE_SMALL_FILE_BYTES = 260 * 1024;
var IMAGE_START_QUALITY = 0.86;
var IMAGE_MIN_QUALITY = 0.72;
var IMAGE_QUALITY_STEP = 0.06;

export function handleImageFileChange(evt) {
  var input = evt.target || evt.srcElement;
  if (!input || !input.files || !input.files.length) { return; }
  var file = input.files[0];
  appState.imageProcessing = true;
  setImagePlaceholderText('Processing image...');
  compressImageFile(file)
    .then(function (dataUrl) {
      if (!dataUrl) { throw new Error('Empty image data.'); }
      appState.selectedImageDataUrl = dataUrl;
      dom.imagePreview.src = dataUrl;
      dom.imagePreview.classList.remove('hidden');
      dom.imagePlaceholder.classList.add('hidden');
      dom.removeImageButton.classList.remove('hidden');
    })
    .catch(function (err) {
      console.log('Image processing error:', err);
      showToast('Could not process the image.', 'error');
      clearSelectedImage();
    })
    .then(function () {
      appState.imageProcessing = false;
      if (!appState.selectedImageDataUrl) {
        setImagePlaceholderText('Preview');
      }
    });
}

export function clearSelectedImage() {
  appState.selectedImageDataUrl = null;
  appState.imageProcessing = false;
  dom.imagePreview.src = '';
  dom.imagePreview.classList.add('hidden');
  dom.imagePlaceholder.classList.remove('hidden');
  dom.removeImageButton.classList.add('hidden');
  setImagePlaceholderText('Preview');
  if (dom.takePhotoInput) { dom.takePhotoInput.value = ''; }
  if (dom.choosePhotoInput) { dom.choosePhotoInput.value = ''; }
}

function setImagePlaceholderText(text) {
  if (!dom.imagePlaceholder) { return; }
  dom.imagePlaceholder.textContent = text || 'Preview';
}

function compressImageFile(file) {
  if (!file || !file.type || file.type.indexOf('image/') !== 0) {
    return readFileAsDataUrl(file);
  }
  if (file.size <= IMAGE_SMALL_FILE_BYTES) {
    return readFileAsDataUrl(file);
  }
  return loadImageSource(file)
    .then(function (source) {
      var target = computeTargetSize(source.width, source.height);
      var shouldResize = target.width !== source.width || target.height !== source.height;
      if (!shouldResize && file.size <= IMAGE_TARGET_MAX_BYTES) {
        source.cleanup();
        return readFileAsDataUrl(file);
      }
      var canvas = document.createElement('canvas');
      canvas.width = target.width;
      canvas.height = target.height;
      var ctx = canvas.getContext('2d', { alpha: false });
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, target.width, target.height);
      ctx.imageSmoothingEnabled = true;
      if (ctx.imageSmoothingQuality) { ctx.imageSmoothingQuality = 'high'; }
      ctx.drawImage(source.image, 0, 0, target.width, target.height);
      source.cleanup();
      return encodeCanvasWithLimit(canvas, 'image/jpeg', IMAGE_START_QUALITY);
    });
}

function computeTargetSize(width, height) {
  var maxDim = Math.max(width, height);
  if (!maxDim || maxDim <= IMAGE_MAX_DIMENSION) {
    return { width: width, height: height };
  }
  var scale = IMAGE_MAX_DIMENSION / maxDim;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale))
  };
}

function encodeCanvasWithLimit(canvas, type, quality) {
  return encodeCanvas(canvas, type, quality)
    .then(function (dataUrl) {
      var size = estimateDataUrlSize(dataUrl);
      if (size <= IMAGE_TARGET_MAX_BYTES || quality <= IMAGE_MIN_QUALITY) {
        return dataUrl;
      }
      var nextQuality = Math.max(IMAGE_MIN_QUALITY, quality - IMAGE_QUALITY_STEP);
      return encodeCanvas(canvas, type, nextQuality)
        .then(function (nextDataUrl) {
          var nextSize = estimateDataUrlSize(nextDataUrl);
          if (nextSize <= IMAGE_TARGET_MAX_BYTES || nextQuality <= IMAGE_MIN_QUALITY) {
            return nextDataUrl;
          }
          var finalQuality = Math.max(IMAGE_MIN_QUALITY, nextQuality - IMAGE_QUALITY_STEP);
          return encodeCanvas(canvas, type, finalQuality);
        });
    });
}

function encodeCanvas(canvas, type, quality) {
  return new Promise(function (resolve) {
    if (canvas.toBlob) {
      canvas.toBlob(function (blob) {
        if (!blob) {
          resolve(canvas.toDataURL(type, quality));
          return;
        }
        var reader = new FileReader();
        reader.onload = function (evt) {
          resolve(evt && evt.target ? evt.target.result : null);
        };
        reader.readAsDataURL(blob);
      }, type, quality);
    } else {
      resolve(canvas.toDataURL(type, quality));
    }
  });
}

function estimateDataUrlSize(dataUrl) {
  if (!dataUrl) { return 0; }
  var comma = dataUrl.indexOf(',');
  if (comma === -1) { return 0; }
  var base64Length = dataUrl.length - comma - 1;
  return Math.round(base64Length * 0.75);
}

function readFileAsDataUrl(file) {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader();
    reader.onload = function (evt) {
      var dataUrl = evt && evt.target ? evt.target.result : null;
      if (!dataUrl) {
        reject(new Error('Empty image data.'));
        return;
      }
      resolve(dataUrl);
    };
    reader.onerror = function () {
      reject(new Error('File read failed.'));
    };
    reader.readAsDataURL(file);
  });
}

function loadImageSource(file) {
  if (window.createImageBitmap) {
    try {
      return createImageBitmap(file, { imageOrientation: 'from-image' })
        .catch(function () { return createImageBitmap(file); })
        .then(function (bitmap) {
          return {
            image: bitmap,
            width: bitmap.width,
            height: bitmap.height,
            cleanup: function () {
              if (bitmap.close) { bitmap.close(); }
            }
          };
        });
    } catch (e) {
      return createImageBitmap(file).then(function (bitmap) {
        return {
          image: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          cleanup: function () {
            if (bitmap.close) { bitmap.close(); }
          }
        };
      });
    }
  }
  return new Promise(function (resolve, reject) {
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      resolve({
        image: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        cleanup: function () {}
      });
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      reject(new Error('Image decode failed.'));
    };
    img.src = url;
  });
}
