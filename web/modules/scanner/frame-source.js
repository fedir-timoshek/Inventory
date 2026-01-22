export function createVideoFrameSource(videoEl, options) {
  options = options || {};
  var stream = null;
  var canvas = document.createElement('canvas');
  var ctx = null;
  try {
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  } catch (e) {
    ctx = canvas.getContext('2d');
  }

  function buildConstraints(deviceId) {
    var constraints = { video: { facingMode: { ideal: 'environment' } }, audio: false };
    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }
    return constraints;
  }

  function start(deviceId) {
    if (!navigator || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.reject(new Error('Camera not supported.'));
    }
    return navigator.mediaDevices.getUserMedia(buildConstraints(deviceId))
      .then(function (mediaStream) {
        stream = mediaStream;
        if (!videoEl) {
          throw new Error('Video element not available.');
        }
        videoEl.srcObject = stream;
        var playPromise = videoEl.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          return playPromise.then(function () { return stream; });
        }
        return stream;
      });
  }

  function stop() {
    if (stream && typeof stream.getTracks === 'function') {
      stream.getTracks().forEach(function (track) { track.stop(); });
    }
    stream = null;
    if (videoEl) {
      try {
        videoEl.pause();
      } catch (e) {}
      videoEl.srcObject = null;
    }
  }

  function captureFrame(roi) {
    if (!videoEl || videoEl.readyState < 2) {
      return null;
    }
    var videoWidth = videoEl.videoWidth || 0;
    var videoHeight = videoEl.videoHeight || 0;
    if (!videoWidth || !videoHeight) { return null; }

    var crop = normalizeRoi(roi, videoWidth, videoHeight);
    var target = scaleTarget(crop.width, crop.height, options.maxWidth || 720, options.maxHeight || 720);

    if (canvas.width !== target.width || canvas.height !== target.height) {
      canvas.width = target.width;
      canvas.height = target.height;
    }

    ctx.drawImage(
      videoEl,
      crop.x, crop.y, crop.width, crop.height,
      0, 0, target.width, target.height
    );
    var imageData = ctx.getImageData(0, 0, target.width, target.height);
    return {
      imageData: imageData,
      width: target.width,
      height: target.height,
      roi: crop,
      scale: target.scale,
      ts: Date.now(),
      canvas: canvas
    };
  }

  function normalizeRoi(roi, videoWidth, videoHeight) {
    var fallback = { x: 0, y: 0, width: videoWidth, height: videoHeight };
    if (!roi) { return fallback; }
    var isNormalized = roi.width <= 1 && roi.height <= 1;
    var x = isNormalized ? Math.round(roi.x * videoWidth) : roi.x;
    var y = isNormalized ? Math.round(roi.y * videoHeight) : roi.y;
    var width = isNormalized ? Math.round(roi.width * videoWidth) : roi.width;
    var height = isNormalized ? Math.round(roi.height * videoHeight) : roi.height;

    if (width <= 0 || height <= 0) { return fallback; }
    if (x < 0) { x = 0; }
    if (y < 0) { y = 0; }
    if (x + width > videoWidth) { width = videoWidth - x; }
    if (y + height > videoHeight) { height = videoHeight - y; }

    return { x: x, y: y, width: width, height: height };
  }

  function scaleTarget(width, height, maxWidth, maxHeight) {
    var scale = Math.min(1, maxWidth / width, maxHeight / height);
    var targetWidth = Math.max(1, Math.round(width * scale));
    var targetHeight = Math.max(1, Math.round(height * scale));
    return { width: targetWidth, height: targetHeight, scale: scale };
  }

  function getStream() { return stream; }

  function getVideoTrack() {
    if (!stream || typeof stream.getVideoTracks !== 'function') { return null; }
    var tracks = stream.getVideoTracks();
    return tracks && tracks.length ? tracks[0] : null;
  }

  return {
    start: start,
    stop: stop,
    captureFrame: captureFrame,
    getStream: getStream,
    getVideoTrack: getVideoTrack
  };
}
