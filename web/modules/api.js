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
      return res.text().then(function (text) {
        var contentType = res.headers.get('content-type') || '';
        if (contentType.indexOf('application/json') === -1) {
          var snippet = (text || '').replace(/\s+/g, ' ').slice(0, 180);
          var typeErr = new Error('API response is not JSON. Check Web App access. ' + snippet);
          typeErr.status = res.status;
          typeErr.responseText = text || '';
          throw typeErr;
        }
        var json;
        try {
          json = JSON.parse(text || '{}');
        } catch (parseErr) {
          var parseError = new Error('API response parse error.');
          parseError.status = res.status;
          parseError.responseText = text || '';
          throw parseError;
        }
        if (!json || json.ok !== true) {
          var apiErr = new Error(json && json.error ? json.error : 'API error');
          apiErr.status = res.status;
          throw apiErr;
        }
        return json.data;
      });
    })
    .catch(function (err) {
      if (err && err.name === 'AbortError') {
        var timeoutError = new Error('Request timed out.');
        timeoutError.isNetworkError = true;
        timeoutError.status = 0;
        throw timeoutError;
      }
      if (err && err.name === 'TypeError') {
        err.isNetworkError = true;
        if (typeof err.status !== 'number') { err.status = 0; }
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
      var timeoutError = new Error('Request timed out.');
      timeoutError.isNetworkError = true;
      timeoutError.status = 0;
      reject(timeoutError);
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
