/*************** CONFIG CONSTANTS ***************/

const CONFIG_KEYS = {
  SPREADSHEET_ID: 'INVENTORY_SPREADSHEET_ID',
  IMAGE_FOLDER_ID: 'IMAGE_FOLDER_ID',
  TIMEZONE: 'TIMEZONE',
  GOOGLE_CLIENT_ID: 'GOOGLE_CLIENT_ID',
  ADMIN_EMAILS: 'ADMIN_EMAILS'
};

// Defaults (used if Script Properties are missing)
const INVENTORY_SPREADSHEET_ID = '19sVQejCQk76mcU7mTiF62OMJD4NWi3gQRLbmMUFfSOk';
const IMAGE_FOLDER_ID = '10F37Nea16AD30jqYWQapXYUGxYL3Ynj8';
const TIMEZONE = 'Europe/Zurich';
const GOOGLE_CLIENT_ID = '180993117826-pnc9bkd8fg3s29hu8ru612cqg0gmk3ld.apps.googleusercontent.com';
const ADMIN_EMAILS = [
  'ftimoshek@icsz.ch',
  'cvongunten@icsz.ch',
  'msalmonson@icsz.ch'
];

// Sheet names (tabs) in the spreadsheet
const INVENTORY_SHEET_NAME = 'Inventory';
const ROOMS_SHEET_NAME = 'Rooms';
const HISTORY_SHEET_NAME = 'History';
const SCAN_STATS_SHEET_NAME = 'ScanStats';

// How many recent entries to return to the UI
const RECENT_ENTRIES_LIMIT = 100;

// Max image payload size (decoded bytes)
const MAX_IMAGE_BYTES = 1200 * 1024;

// Allowed MIME types for uploads
const ALLOWED_IMAGE_TYPES = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp'
};

// Column indexes in the Inventory sheet (1-based)
const COL = {
  ID: 1,
  TIMESTAMP: 2,
  BARCODE: 3,
  ROOM: 4,
  QUANTITY: 5,
  NOTES: 6,
  IMAGE_URL: 7,
  USER_EMAIL: 8,
  DELETED: 9     // TRUE/FALSE for soft delete
};

var CONFIG_CACHE = null;

function getConfig_() {
  if (CONFIG_CACHE) {
    return CONFIG_CACHE;
  }
  var props = PropertiesService.getScriptProperties();
  var spreadsheetId = props.getProperty(CONFIG_KEYS.SPREADSHEET_ID) || INVENTORY_SPREADSHEET_ID;
  var imageFolderId = props.getProperty(CONFIG_KEYS.IMAGE_FOLDER_ID) || IMAGE_FOLDER_ID;
  var timezone = props.getProperty(CONFIG_KEYS.TIMEZONE) || TIMEZONE;
  var googleClientId = props.getProperty(CONFIG_KEYS.GOOGLE_CLIENT_ID) || GOOGLE_CLIENT_ID;
  var adminRaw = props.getProperty(CONFIG_KEYS.ADMIN_EMAILS) || ADMIN_EMAILS.join(',');
  persistMissingConfig_(props, CONFIG_KEYS.SPREADSHEET_ID, spreadsheetId);
  persistMissingConfig_(props, CONFIG_KEYS.IMAGE_FOLDER_ID, imageFolderId);
  persistMissingConfig_(props, CONFIG_KEYS.TIMEZONE, timezone);
  persistMissingConfig_(props, CONFIG_KEYS.GOOGLE_CLIENT_ID, googleClientId);
  persistMissingConfig_(props, CONFIG_KEYS.ADMIN_EMAILS, adminRaw);
  var adminEmails = adminRaw
    .split(',')
    .map(function (email) { return email.trim().toLowerCase(); })
    .filter(function (email) { return !!email; });

  if (!spreadsheetId) {
    throw new Error('Missing script property: ' + CONFIG_KEYS.SPREADSHEET_ID);
  }
  if (!imageFolderId) {
    throw new Error('Missing script property: ' + CONFIG_KEYS.IMAGE_FOLDER_ID);
  }
  if (!googleClientId) {
    throw new Error('Missing script property: ' + CONFIG_KEYS.GOOGLE_CLIENT_ID);
  }

  CONFIG_CACHE = {
    spreadsheetId: spreadsheetId,
    imageFolderId: imageFolderId,
    timezone: timezone,
    googleClientId: googleClientId,
    adminEmails: adminEmails
  };
  return CONFIG_CACHE;
}

function persistMissingConfig_(props, key, value) {
  if (!props.getProperty(key) && value) {
    props.setProperty(key, value);
  }
}


/*************** ENTRY POINT (WEB APP) ***************/

function doGet(e) {
  return buildJsonResponse_({ ok: true, message: 'ICS Inventory API' });
}

function doPost(e) {
  try {
    var raw = (e && e.postData && e.postData.contents) ? e.postData.contents : '';
    var body = raw ? JSON.parse(raw) : {};
    var action = body.action || '';
    var token = body.token || '';
    var payload = body.payload || {};
    var result = handleApiAction_(action, token, payload);
    return buildJsonResponse_({ ok: true, data: result });
  } catch (err) {
    return buildJsonResponse_({ ok: false, error: err && err.message ? err.message : String(err) });
  }
}


/*************** PUBLIC SERVER FUNCTIONS ***************/

/**
 * Returns initial data for the UI:
 * - rooms list
 * - current user email
 * - isAdmin flag
 * - recent entries
 */
function getInitialData(idToken) {
  var userEmail = getUserEmailFromToken_(idToken);
  var isAdmin = isAdmin_(userEmail);
  var rooms = getRooms_();
  var entries = isAdmin ? listEntries_(RECENT_ENTRIES_LIMIT) : listEntries_(RECENT_ENTRIES_LIMIT, userEmail);
  getScanStatsSheet_();

  return {
    userEmail: userEmail,
    isAdmin: isAdmin,
    rooms: rooms,
    entries: entries
  };
}

function handleApiAction_(action, token, payload) {
  if (!action) {
    throw new Error('Missing action.');
  }
  if (action === 'getInitialData') {
    return getInitialData(token);
  }
  if (action === 'saveEntry') {
    return saveEntry(token, payload);
  }
  if (action === 'uploadEntryImage') {
    return uploadEntryImage(token, payload);
  }
  if (action === 'listEntries') {
    return listEntries(token, payload && payload.limit ? payload.limit : undefined);
  }
  if (action === 'updateEntry') {
    return updateEntry(token, payload);
  }
  if (action === 'deleteEntry') {
    return deleteEntry(token, payload && payload.id ? payload.id : payload);
  }
  if (action === 'logScanStat') {
    return logScanStat(token, payload);
  }
  throw new Error('Unknown action: ' + action);
}

/**
 * Saves a new inventory entry from the form.
 * formData = { barcode, room, notes, quantity, imageDataUrl? }
 */
function saveEntry(idToken, formData) {
  var userEmail = getUserEmailFromToken_(idToken);
  var sheet = getSheetByName_(INVENTORY_SHEET_NAME);

  var barcode = (formData && formData.barcode || '').toString().trim();
  var room = (formData && formData.room || '').toString().trim();
  var notes = (formData && formData.notes || '').toString();
  var quantity = parseInt(formData && formData.quantity, 10);
  if (!quantity || quantity < 1) {
    quantity = 1;
  }

  if (!barcode) {
    throw new Error('Barcode is required.');
  }
  if (!room) {
    throw new Error('Room is required.');
  }

  var clientEntryId = (formData && formData.clientEntryId) ? formData.clientEntryId.toString() : '';
  var id = clientEntryId || Utilities.getUuid();
  var now = new Date();
  var imageUrl = '';

  if (clientEntryId) {
    var existingRowIndex = findRowById_(sheet, id);
    if (existingRowIndex !== -1) {
      var existingLastCol = Math.max(sheet.getLastColumn(), COL.DELETED);
      var existingRow = sheet.getRange(existingRowIndex, 1, 1, existingLastCol).getValues()[0];
      return rowToEntryObject_(existingRow);
    }
  }

  if (formData && formData.imageDataUrl) {
    imageUrl = saveImageToDrive_(formData.imageDataUrl, id);
  }

  var rowValues = [
    id,
    now,
    barcode,
    room,
    quantity,
    notes,
    imageUrl,
    userEmail,
    false // Deleted flag
  ];

  sheet.appendRow(rowValues);

  var entryObject = rowToEntryObject_(rowValues);
  logHistory_('CREATE', id, userEmail, null, entryObject);

  return entryObject;
}

/**
 * Uploads or replaces the image for an existing entry.
 * payload = { id, imageDataUrl }
 */
function uploadEntryImage(idToken, payload) {
  var userEmail = getUserEmailFromToken_(idToken);
  if (!payload || !payload.id) {
    throw new Error('Missing entry ID.');
  }
  if (!payload.imageDataUrl) {
    throw new Error('Missing image data.');
  }

  var id = payload.id.toString();
  var sheet = getSheetByName_(INVENTORY_SHEET_NAME);
  var rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) {
    throw new Error('Entry not found.');
  }

  var lastCol = Math.max(sheet.getLastColumn(), COL.DELETED);
  var rowRange = sheet.getRange(rowIndex, 1, 1, lastCol);
  var rowValues = rowRange.getValues()[0];
  var oldEntry = rowToEntryObject_(rowValues);
  var entryOwner = (rowValues[COL.USER_EMAIL - 1] || '').toString().toLowerCase();
  if (!isAdmin_(userEmail) && entryOwner && entryOwner !== userEmail.toLowerCase()) {
    throw new Error('You do not have permission to update this entry.');
  }

  var imageUrl = saveImageToDrive_(payload.imageDataUrl, id);
  rowValues[COL.IMAGE_URL - 1] = imageUrl;
  rowRange.setValues([rowValues]);

  var newEntry = rowToEntryObject_(rowValues);
  logHistory_('IMAGE', id, userEmail, oldEntry, newEntry);
  return newEntry;
}

/**
 * Returns a list of recent entries (optionally limited).
 */
function listEntries(idToken, limit) {
  var userEmail = getUserEmailFromToken_(idToken);
  var isAdmin = isAdmin_(userEmail);
  limit = limit || RECENT_ENTRIES_LIMIT;
  return isAdmin ? listEntries_(limit) : listEntries_(limit, userEmail);
}

/**
 * Updates an existing entry (admin only).
 * entryData = { id, room, notes, quantity }
 */
function updateEntry(idToken, entryData) {
  var userEmail = getUserEmailFromToken_(idToken);
  if (!isAdmin_(userEmail)) {
    throw new Error('You do not have permission to update entries.');
  }

  if (!entryData || !entryData.id) {
    throw new Error('Missing entry ID.');
  }

  var id = entryData.id.toString();
  var sheet = getSheetByName_(INVENTORY_SHEET_NAME);
  var rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) {
    throw new Error('Entry not found.');
  }

  var lastCol = Math.max(sheet.getLastColumn(), COL.DELETED);
  var rowRange = sheet.getRange(rowIndex, 1, 1, lastCol);
  var rowValues = rowRange.getValues()[0];

  var oldEntry = rowToEntryObject_(rowValues);

  var now = new Date();
  if (entryData.room) {
    rowValues[COL.ROOM - 1] = entryData.room;
  }
  if (entryData.notes !== undefined) {
    rowValues[COL.NOTES - 1] = entryData.notes;
  }
  if (entryData.quantity !== undefined) {
    var qty = parseInt(entryData.quantity, 10);
    if (!qty || qty < 1) { qty = 1; }
    rowValues[COL.QUANTITY - 1] = qty;
  }
  rowValues[COL.TIMESTAMP - 1] = now; // update timestamp on change

  rowRange.setValues([rowValues]);

  var newEntry = rowToEntryObject_(rowValues);
  logHistory_('UPDATE', id, userEmail, oldEntry, newEntry);

  return newEntry;
}

/**
 * Soft-delete an entry (admin only).
 * Sets Deleted = TRUE and logs to History.
 */
function deleteEntry(idToken, entryId) {
  var userEmail = getUserEmailFromToken_(idToken);
  if (!isAdmin_(userEmail)) {
    throw new Error('You do not have permission to delete entries.');
  }
  if (!entryId) {
    throw new Error('Missing entry ID.');
  }

  var id = entryId.toString();
  var sheet = getSheetByName_(INVENTORY_SHEET_NAME);
  var rowIndex = findRowById_(sheet, id);
  if (rowIndex === -1) {
    throw new Error('Entry not found.');
  }

  var lastCol = sheet.getLastColumn();
  var rowRange = sheet.getRange(rowIndex, 1, 1, lastCol);
  var rowValues = rowRange.getValues()[0];

  var oldEntry = rowToEntryObject_(rowValues);

  rowValues[COL.DELETED - 1] = true;
  rowValues[COL.TIMESTAMP - 1] = new Date();
  rowRange.setValues([rowValues]);

  logHistory_('DELETE', id, userEmail, oldEntry, null);

  return { success: true };
}

/**
 * Logs scanner stats to the ScanStats sheet.
 * payload = { os, deviceModel, browser, barcodeFormat, scanMs, engineId, engineName }
 */
function logScanStat(idToken, payload) {
  getUserEmailFromToken_(idToken);
  payload = payload || {};
  var sheet = getScanStatsSheet_();
  var now = new Date();
  var os = sanitizeStatValue_(payload.os, 80);
  var deviceModel = sanitizeStatValue_(payload.deviceModel, 120);
  var browser = sanitizeStatValue_(payload.browser, 80);
  var barcodeFormat = sanitizeStatValue_(payload.barcodeFormat || payload.format, 40);
  var scanMs = parseInt(payload.scanMs, 10);
  if (!scanMs || scanMs < 0) { scanMs = ''; }
  var engineId = sanitizeStatValue_(payload.engineId, 80);
  var engineName = sanitizeStatValue_(payload.engineName, 120);
  var online = sanitizeStatValue_(payload.online, 12);
  var statId = sanitizeStatValue_(payload.statId || payload.localId, 120);

  if (statId) {
    var statIdCol = getScanStatsColumnIndex_(sheet, 'Stat ID');
    var lastRow = sheet.getLastRow();
    if (statIdCol > 0 && lastRow > 1) {
      var finder = sheet.getRange(2, statIdCol, lastRow - 1, 1)
        .createTextFinder(statId)
        .matchEntireCell(true)
        .findNext();
      if (finder) {
        return { success: true, deduped: true };
      }
    }
  }

  sheet.appendRow([
    now,
    os,
    deviceModel,
    browser,
    barcodeFormat,
    scanMs,
    engineId,
    engineName,
    online,
    statId
  ]);

  return { success: true };
}


/*************** HELPERS: SHEETS & DATA ***************/

function getSpreadsheet_() {
  return SpreadsheetApp.openById(getConfig_().spreadsheetId);
}

function getScanStatsSheet_() {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(SCAN_STATS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SCAN_STATS_SHEET_NAME);
  }
  ensureScanStatsHeader_(sheet);
  return sheet;
}

function ensureScanStatsHeader_(sheet) {
  var headers = [
    'Timestamp',
    'OS',
    'Device Model',
    'Browser',
    'Barcode Format',
    'Scan Time (ms)',
    'Engine Id',
    'Engine Name',
    'Online',
    'Stat ID'
  ];
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    return;
  }
  var lastCol = Math.max(sheet.getLastColumn(), headers.length);
  var row = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var needsUpdate = false;
  for (var i = 0; i < headers.length; i++) {
    if (!row[i]) {
      row[i] = headers[i];
      needsUpdate = true;
    }
  }
  if (needsUpdate) {
    sheet.getRange(1, 1, 1, headers.length).setValues([row.slice(0, headers.length)]);
  }
  if (sheet.getFrozenRows() < 1) {
    sheet.setFrozenRows(1);
  }
}

function getScanStatsColumnIndex_(sheet, headerName) {
  var lastCol = sheet.getLastColumn();
  if (lastCol < 1) { return -1; }
  var row = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  for (var i = 0; i < row.length; i++) {
    if (row[i] === headerName) {
      return i + 1;
    }
  }
  return -1;
}

function sanitizeStatValue_(value, maxLen) {
  if (value === null || value === undefined) { return ''; }
  var text = String(value).trim();
  if (maxLen && text.length > maxLen) {
    text = text.slice(0, maxLen);
  }
  return text;
}

function getSheetByName_(name) {
  var ss = getSpreadsheet_();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    throw new Error('Sheet not found: ' + name);
  }
  return sheet;
}

function getUserEmailFromToken_(idToken) {
  var user = verifyIdToken_(idToken);
  if (!user.email) {
    throw new Error('Could not determine user email.');
  }
  return user.email;
}

function verifyIdToken_(idToken) {
  if (!idToken) {
    throw new Error('Missing authentication token.');
  }
  var url = 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error('Invalid authentication token.');
  }
  var payload = JSON.parse(response.getContentText() || '{}');
  if (payload.aud !== getConfig_().googleClientId) {
    throw new Error('Authentication token client mismatch.');
  }
  var emailVerified = payload.email_verified === true || payload.email_verified === 'true';
  if (!emailVerified) {
    throw new Error('Email is not verified.');
  }
  return {
    email: payload.email || '',
    sub: payload.sub || ''
  };
}

function buildJsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAdmin_(email) {
  var target = (email || '').toLowerCase();
  return getConfig_().adminEmails.indexOf(target) !== -1;
}

/**
 * Reads rooms from the Rooms sheet (column A, from row 2 onwards).
 */
function getRooms_() {
  var sheet = getSheetByName_(ROOMS_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }
  var range = sheet.getRange(2, 1, lastRow - 1, 1); // A2:A
  var values = range.getValues();
  var rooms = [];
  for (var i = 0; i < values.length; i++) {
    var room = (values[i][0] || '').toString().trim();
    if (room) {
      rooms.push(room);
    }
  }
  return rooms;
}

/**
 * Internal function that reads recent entries from Inventory,
 * skipping soft-deleted rows. Optionally filters by user email.
 */
function listEntries_(limit, userEmailFilter) {
  var sheet = getSheetByName_(INVENTORY_SHEET_NAME);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return [];
  }

  var lastCol = sheet.getLastColumn();
  var dataRange = sheet.getRange(2, 1, lastRow - 1, lastCol);
  var values = dataRange.getValues();

  var entries = [];
  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var deleted = row[COL.DELETED - 1];
    if (deleted === true || deleted === 'TRUE') {
      continue;
    }
    var id = row[COL.ID - 1];
    if (!id) {
      continue;
    }
    var entryObj = rowToEntryObject_(row);
    if (userEmailFilter) {
      var entryEmail = (entryObj.userEmail || '').toString().toLowerCase();
      if (entryEmail !== userEmailFilter.toLowerCase()) {
        continue;
      }
    }
    entries.push(entryObj);
    if (entries.length >= limit) {
      break;
    }
  }
  return entries;
}

/**
 * Converts a sheet row array into a JS object that the client expects.
 */
function rowToEntryObject_(row) {
  var qty = parseInt(row[COL.QUANTITY - 1], 10);
  if (!qty || qty < 1) { qty = 1; }
  return {
    id: row[COL.ID - 1] || '',
    timestamp: formatDate_(row[COL.TIMESTAMP - 1]),
    barcode: row[COL.BARCODE - 1] || '',
    room: row[COL.ROOM - 1] || '',
    notes: row[COL.NOTES - 1] || '',
    imageUrl: row[COL.IMAGE_URL - 1] || '',
    userEmail: row[COL.USER_EMAIL - 1] || '',
    quantity: qty
  };
}

/**
 * Find the row index (1-based) of a given entry ID in Inventory.
 * Returns -1 if not found.
 */
function findRowById_(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return -1;
  }
  var range = sheet.getRange(2, COL.ID, lastRow - 1, 1); // ID column
  var values = range.getValues();
  for (var i = 0; i < values.length; i++) {
    if (values[i][0] === id) {
      return i + 2; // offset for header
    }
  }
  return -1;
}

/**
 * Format a date as yyyy-MM-dd HH:mm:ss in the configured TIMEZONE.
 */
function formatDate_(value) {
  if (!value) {
    return '';
  }
  var date = (value instanceof Date) ? value : new Date(value);
  return Utilities.formatDate(date, getConfig_().timezone, 'yyyy-MM-dd HH:mm:ss');
}


/*************** HELPERS: IMAGE UPLOAD ***************/

/**
 * Saves a base64 image data URL to the Inventory Images folder.
 * Returns the file URL.
 */
function saveImageToDrive_(imageDataUrl, entryId) {
  try {
    var matches = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!matches) {
      throw new Error('Invalid image data.');
    }
    var contentType = matches[1];
    var base64Data = matches[2];
    var extension = getExtensionForContentType_(contentType);
    if (!extension) {
      throw new Error('Unsupported image type.');
    }
    var estimatedBytes = Math.floor((base64Data.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      throw new Error('Image too large. Max ' + MAX_IMAGE_BYTES + ' bytes.');
    }

    var bytes = Utilities.base64Decode(base64Data);
    var blob = Utilities.newBlob(bytes, contentType, 'inventory_' + entryId + '.' + extension);

    var folder = DriveApp.getFolderById(getConfig_().imageFolderId);
    var file = folder.createFile(blob);

    // Make sure domain users can view the image via link
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();
  } catch (err) {
    throw new Error('Failed to save image: ' + err);
  }
}

function getExtensionForContentType_(contentType) {
  if (!contentType) return '';
  return ALLOWED_IMAGE_TYPES[contentType] || '';
}


/*************** HELPERS: HISTORY LOGGING ***************/

/**
 * Logs changes to the History sheet.
 * action: CREATE, UPDATE, DELETE
 * oldValues/newValues: entry objects or null
 */
function logHistory_(action, entryId, userEmail, oldValues, newValues) {
  var sheet = getSheetByName_(HISTORY_SHEET_NAME);
  var now = new Date();
  userEmail = userEmail || 'unknown';

  var oldJson = oldValues ? JSON.stringify(oldValues) : '';
  var newJson = newValues ? JSON.stringify(newValues) : '';

  sheet.appendRow([
    now,
    action,
    entryId,
    userEmail,
    oldJson,
    newJson
  ]);
}
