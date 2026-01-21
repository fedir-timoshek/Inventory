import { appState, AUTH_TOKEN_KEY } from './state.js';
import { dom } from './dom.js';
import { callApi, getGoogleClientId, hasServer } from './api.js';
import { showToast } from './toast.js';

var authHandlers = {};
var MAX_GSI_ATTEMPTS = 80;

export function initAuth(handlers) {
  authHandlers = handlers || {};
  clearLegacyToken();
  showLoadingScreen(true, 'Checking session...');
  showAuthScreen(false);
  waitForGsi(0);
}

export function handleSignOut() {
  setAuthToken('');
  appState.userEmail = '';
  updateUserBadge();
  showLoadingScreen(false);
  showAuthScreen(true);
}

export function ensureAuth() {
  if (!appState.authToken) {
    showAuthScreen(true);
    showToast('Please sign in to continue.', 'error');
    return false;
  }
  return true;
}

export function updateUserBadge() {
  if (appState.userEmail) {
    dom.userBadge.textContent = appState.userEmail;
    dom.userBadge.title = appState.userEmail;
    if (dom.btnSignOut) { dom.btnSignOut.classList.remove('hidden'); }
  } else {
    dom.userBadge.textContent = '';
    dom.userBadge.title = '';
    if (dom.btnSignOut) { dom.btnSignOut.classList.add('hidden'); }
  }
}

function showAuthScreen(show) {
  if (!dom.authScreen) { return; }
  dom.authScreen.classList.toggle('hidden', !show);
}

function showLoadingScreen(show, message) {
  if (!dom.loadingScreen) { return; }
  if (typeof message === 'string' && dom.loadingStatus) {
    dom.loadingStatus.textContent = message;
  }
  dom.loadingScreen.classList.toggle('is-hidden', !show);
  dom.loadingScreen.setAttribute('aria-hidden', show ? 'false' : 'true');
}

function showAuthError(message) {
  if (!dom.authError) { return; }
  if (message) {
    dom.authError.textContent = message;
    dom.authError.classList.remove('hidden');
  } else {
    dom.authError.textContent = '';
    dom.authError.classList.add('hidden');
  }
}

function setAuthToken(token) {
  appState.authToken = token || '';
  try {
    var storage = getAuthStorage();
    if (storage) {
      if (appState.authToken) {
        storage.setItem(AUTH_TOKEN_KEY, appState.authToken);
      } else {
        storage.removeItem(AUTH_TOKEN_KEY);
      }
    }
    clearLegacyToken();
  } catch (e) {}
}

function loadStoredToken() {
  try {
    var storage = getAuthStorage();
    if (!storage) { return ''; }
    return storage.getItem(AUTH_TOKEN_KEY) || '';
  } catch (e) {
    return '';
  }
}

function waitForGsi(attempts) {
  var clientId = getGoogleClientId();
  if (!clientId) {
    showAuthError('Missing Google client ID configuration.');
    showLoadingScreen(false);
    showAuthScreen(true);
    return;
  }
  if (window.google && google.accounts && google.accounts.id) {
    initializeGsi(clientId);
    return;
  }
  if (attempts >= MAX_GSI_ATTEMPTS) {
    showAuthError('Google sign-in library failed to load.');
    showLoadingScreen(false);
    showAuthScreen(true);
    return;
  }
  setTimeout(function () { waitForGsi(attempts + 1); }, 250);
}

function getAuthStorage() {
  try {
    if (window.sessionStorage) { return window.sessionStorage; }
  } catch (e) {}
  return null;
}

function clearLegacyToken() {
  try {
    if (window.localStorage) { localStorage.removeItem(AUTH_TOKEN_KEY); }
  } catch (e) {}
}

function initializeGsi(clientId) {
  google.accounts.id.initialize({
    client_id: clientId,
    callback: handleCredentialResponse
  });
  if (dom.googleSignInButton) {
    google.accounts.id.renderButton(dom.googleSignInButton, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill'
    });
  }

  var storedToken = loadStoredToken();
  if (storedToken) {
    showLoadingScreen(true, 'Signing you in...');
    attemptAuth(storedToken);
  } else {
    showLoadingScreen(false);
    showAuthScreen(true);
  }
}

function handleCredentialResponse(response) {
  var token = response && response.credential ? response.credential : '';
  if (!token) {
    showAuthError('Sign-in failed. Please try again.');
    showLoadingScreen(false);
    showAuthScreen(true);
    return;
  }
  showLoadingScreen(true, 'Signing you in...');
  attemptAuth(token);
}

function attemptAuth(idToken) {
  if (!hasServer()) {
    showAuthError('Authentication requires the API URL.');
    showLoadingScreen(false);
    showAuthScreen(true);
    return;
  }
  showAuthError('');
  showAuthScreen(false);
  showLoadingScreen(true, 'Signing you in...');
  callApi('getInitialData', idToken, {})
    .then(function (data) {
      setAuthToken(idToken);
      showLoadingScreen(false);
      showAuthScreen(false);
      if (authHandlers.onInitialData) { authHandlers.onInitialData(data); }
      if (authHandlers.onSignedIn) { authHandlers.onSignedIn(data); }
    })
    .catch(function (err) {
      setAuthToken('');
      var msg = (err && err.message) ? err.message : 'Sign-in failed. Please sign in again.';
      showAuthError(msg);
      showLoadingScreen(false);
      showAuthScreen(true);
    });
}
