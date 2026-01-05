/*************** CONFIG CONSTANTS ***************/

// Spreadsheet that holds Inventory, Rooms, History sheets.
// Get this ID from the URL of the Google Sheet.
const INVENTORY_SPREADSHEET_ID = '19sVQejCQk76mcU7mTiF62OMJD4NWi3gQRLbmMUFfSOk';

// Sheet names (tabs) in that spreadsheet
const INVENTORY_SHEET_NAME = 'Inventory';
const ROOMS_SHEET_NAME = 'Rooms';
const HISTORY_SHEET_NAME = 'History';

// Folder in the same Shared Drive where images are stored.
// Get this ID from the Inventory Images folder URL.
const IMAGE_FOLDER_ID = '10F37Nea16AD30jqYWQapXYUGxYL3Ynj8';

// Timezone for timestamp formatting
const TIMEZONE = 'Europe/Zurich';

// Google OAuth client ID for SSO (Web application type)
const GOOGLE_CLIENT_ID = '180993117826-pnc9bkd8fg3s29hu8ru612cqg0gmk3ld.apps.googleusercontent.com';

// How many recent entries to return to the UI
const RECENT_ENTRIES_LIMIT = 100;

// Admin emails (full addresses in your Workspace domain)
const ADMIN_EMAILS = [
  'ftimoshek@icsz.ch',
  'ftimoshek@icsz.ch'
];

// Column indexes in the Inventory sheet (1-based)
const COL = {
  ID: 1,
  TIMESTAMP: 2,
  BARCODE: 3,
  ROOM: 4,
  NOTES: 5,
  IMAGE_URL: 6,
  USER_EMAIL: 7,
  DELETED: 8     // TRUE/FALSE for soft delete
};


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
  var entries = listEntries_(RECENT_ENTRIES_LIMIT);

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
  if (action === 'listEntries') {
    return listEntries(token, payload && payload.limit ? payload.limit : undefined);
  }
  if (action === 'updateEntry') {
    return updateEntry(token, payload);
  }
  if (action === 'deleteEntry') {
    return deleteEntry(token, payload && payload.id ? payload.id : payload);
  }
  throw new Error('Unknown action: ' + action);
}

/**
 * Saves a new inventory entry from the form.
 * formData = { barcode, room, notes, imageDataUrl }
 */
function saveEntry(idToken, formData) {
  var userEmail = getUserEmailFromToken_(idToken);
  var sheet = getSheetByName_(INVENTORY_SHEET_NAME);

  var barcode = (formData && formData.barcode || '').toString().trim();
  var room = (formData && formData.room || '').toString().trim();
  var notes = (formData && formData.notes || '').toString();

  if (!barcode) {
    throw new Error('Barcode is required.');
  }
  if (!room) {
    throw new Error('Room is required.');
  }

  var id = Utilities.getUuid();
  var now = new Date();
  var imageUrl = '';

  if (formData && formData.imageDataUrl) {
    imageUrl = saveImageToDrive_(formData.imageDataUrl, id);
  }

  var rowValues = [
    id,
    now,
    barcode,
    room,
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
 * Returns a list of recent entries (optionally limited).
 */
function listEntries(idToken, limit) {
  getUserEmailFromToken_(idToken);
  limit = limit || RECENT_ENTRIES_LIMIT;
  return listEntries_(limit);
}

/**
 * Updates an existing entry (admin only).
 * entryData = { id, room, notes }
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

  var lastCol = sheet.getLastColumn();
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


/*************** HELPERS: SHEETS & DATA ***************/

function getSpreadsheet_() {
  return SpreadsheetApp.openById(INVENTORY_SPREADSHEET_ID);
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
  if (payload.aud !== GOOGLE_CLIENT_ID) {
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
  return ADMIN_EMAILS.indexOf(email) !== -1;
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
 * skipping soft-deleted rows.
 */
function listEntries_(limit) {
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
  return {
    id: row[COL.ID - 1] || '',
    timestamp: formatDate_(row[COL.TIMESTAMP - 1]),
    barcode: row[COL.BARCODE - 1] || '',
    room: row[COL.ROOM - 1] || '',
    notes: row[COL.NOTES - 1] || '',
    imageUrl: row[COL.IMAGE_URL - 1] || '',
    userEmail: row[COL.USER_EMAIL - 1] || ''
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
  return Utilities.formatDate(date, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
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

    var bytes = Utilities.base64Decode(base64Data);
    var extension = getExtensionForContentType_(contentType);
    var blob = Utilities.newBlob(bytes, contentType, 'inventory_' + entryId + '.' + extension);

    var folder = DriveApp.getFolderById(IMAGE_FOLDER_ID);
    var file = folder.createFile(blob);

    // Make sure domain users can view the image via link
    file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();
  } catch (err) {
    throw new Error('Failed to save image: ' + err);
  }
}

function getExtensionForContentType_(contentType) {
  if (!contentType) return 'png';
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/gif') return 'gif';
  return 'png';
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
