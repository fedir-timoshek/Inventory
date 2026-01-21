import { APP_CONFIG } from './state.js';

export function initConfig() {
  var metaClient = document.querySelector('meta[name="google-client-id"]');
  if (metaClient && metaClient.content) {
    APP_CONFIG.googleClientId = metaClient.content;
  }
  var metaApi = document.querySelector('meta[name="api-url"]');
  if (metaApi && metaApi.content) {
    APP_CONFIG.apiUrl = metaApi.content;
  }
}

export function getGoogleClientId() {
  return APP_CONFIG.googleClientId || '';
}

export function hasServer() {
  return !!(APP_CONFIG.apiUrl && APP_CONFIG.apiUrl.indexOf('http') === 0);
}

export function callApi(action, token, payload, options) {
  if (!hasServer()) {
    return Promise.reject(new Error('Missing API URL.'));
  }
  options = options || {};
  var timeoutMs = (typeof options.timeoutMs === 'number') ? options.timeoutMs : 15000;
  var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var body = JSON.stringify({ action: action, token: token || '', payload: payload || {} });
  var fetchPromise = fetch(APP_CONFIG.apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: body,
    signal: controller ? controller.signal : undefined
  })
    .then(function (res) {
      var contentType = res.headers.get('content-type') || '';
      if (contentType.indexOf('application/json') === -1) {
        return res.text().then(function (text) {
          var snippet = (text || '').replace(/\s+/g, ' ').slice(0, 180);
          throw new Error('API response is not JSON. Check Web App access. ' + snippet);
        });
      }
      return res.json();
    })
    .then(function (json) {
      if (!json || json.ok !== true) {
        throw new Error(json && json.error ? json.error : 'API error');
      }
      return json.data;
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') {
        throw new Error('Request timed out.');
      }
      throw err;
    });

  if (!timeoutMs || timeoutMs <= 0) {
    return fetchPromise;
  }

  var timeoutId = null;
  var timeoutPromise = new Promise(function (resolve, reject) {
    timeoutId = setTimeout(function () {
      if (controller) { controller.abort(); }
      reject(new Error('Request timed out.'));
    }, timeoutMs);
  });

  return Promise.race([fetchPromise, timeoutPromise])
    .then(function (data) {
      if (timeoutId) { clearTimeout(timeoutId); }
      return data;
    })
    .catch(function (err) {
      if (timeoutId) { clearTimeout(timeoutId); }
      throw err;
    });
}
