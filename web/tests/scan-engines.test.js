import { detectCapabilities } from '../modules/scanner/capabilities.js';
import { createSupportedEngines } from '../modules/scanner/engine-registry.js';

var resultsEl = document.getElementById('engineResults');

var testImages = [
  {
    label: 'Code 128',
    src: 'assets/scan-tests/code128-inv-12345.png',
    expected: 'INV-128-12345'
  },
  {
    label: 'Code 39',
    src: 'assets/scan-tests/code39-abc123.png',
    expected: 'CODE39-ABC123'
  }
];

function addResultCard(title, lines) {
  var card = document.createElement('div');
  card.className = 'engine-card';
  var header = document.createElement('h3');
  header.textContent = title;
  card.appendChild(header);
  for (var i = 0; i < lines.length; i++) {
    var line = document.createElement('div');
    line.className = 'engine-result';
    line.textContent = lines[i];
    card.appendChild(line);
  }
  resultsEl.appendChild(card);
}

function loadImage(src) {
  return new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () { resolve(img); };
    img.onerror = function () { reject(new Error('Image load failed: ' + src)); };
    img.src = src;
  });
}

function buildFrameFromImage(img) {
  var canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  var ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  var imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return {
    imageData: imageData,
    width: imageData.width,
    height: imageData.height,
    roiStage: 0,
    scale: 1,
    canvas: canvas
  };
}

async function runEngineTests() {
  var capabilities = await detectCapabilities();
  var engines = createSupportedEngines(capabilities);
  var engineNames = engines.map(function (engine) { return engine.name; }).join(', ');
  addResultCard('Engines Detected', [engineNames || 'None']);
  if (!engines.length) { return; }

  for (var e = 0; e < engines.length; e++) {
    var engine = engines[e];
    var lines = [];
    try {
      if (engine.prepare) { await engine.prepare(); }
      for (var i = 0; i < testImages.length; i++) {
        var test = testImages[i];
        var img = await loadImage(test.src);
        var frame = buildFrameFromImage(img);
        var result = await engine.scanFrame(frame);
        if (result && result.rawValue) {
          lines.push(test.label + ': ' + result.rawValue + ' (' + (result.format || 'unknown') + ')');
        } else {
          lines.push(test.label + ': no result');
        }
      }
    } catch (err) {
      lines.push('Error: ' + (err && err.message ? err.message : 'Unknown error'));
    } finally {
      if (engine.dispose) { await engine.dispose(); }
    }
    addResultCard(engine.name, lines);
  }
}

runEngineTests();
