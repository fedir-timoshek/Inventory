export var OFFLINE_QUEUE_KEY = 'icsInventoryOfflineQueue_v1';
export var AUTH_TOKEN_KEY = 'icsInventoryAuthToken_v1';

export var APP_CONFIG = {
  googleClientId: '',
  apiUrl: ''
};

export var appState = {
  entries: [],
  filteredEntries: [],
  rooms: [],
  isAdmin: false,
  adminMode: false,
  userEmail: '',
  authToken: '',
  scanning: false,
  continuousScanning: false,
  cameraSupported: false,
  selectedCameraId: '',
  torchSupported: false,
  torchOn: false,
  selectedImageDataUrl: null,
  offlineQueue: [],
  filterText: '',
  editingEntryId: null,
  scannerSheetOpen: false
};

export var scannerState = {
  codeReader: null,
  lastCode: '',
  lastCodeTime: 0,
  cooldownMs: 1500,
  autoCloseTimer: null
};
