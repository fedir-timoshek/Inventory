import { appState } from './state.js';
import { dom } from './dom.js';
import { callApi, hasServer } from './api.js';
import { ensureAuth } from './auth.js';
import { showToast } from './toast.js';
import { findAncestorWithAttr } from './utils.js';

export function setFilterText(text) {
  appState.filterText = text || '';
  applyFilterAndRender();
}

export function setAdminMode(enabled) {
  appState.adminMode = !!enabled;
  appState.editingEntryId = null;
  renderEntries();
}

export function applyFilterAndRender() {
  var entries = appState.entries || [];
  var visible = [];
  if (appState.isAdmin || !appState.userEmail) {
    visible = entries.slice(0);
  } else {
    var targetEmail = appState.userEmail.toLowerCase();
    for (var v = 0; v < entries.length; v++) {
      var entry = entries[v];
      var entryEmail = (entry.userEmail || '').toString().toLowerCase();
      if (entryEmail === targetEmail) {
        visible.push(entry);
      }
    }
  }
  var term = (appState.filterText || '').toLowerCase();
  if (!term) {
    appState.filteredEntries = visible.slice(0);
  } else {
    var filtered = [];
    for (var i = 0; i < visible.length; i++) {
      var e = visible[i];
      var barcode = (e.barcode || '').toString().toLowerCase();
      var room = (e.room || '').toString().toLowerCase();
      var notes = (e.notes || '').toString().toLowerCase();
      var quantity = (e.quantity !== undefined && e.quantity !== null) ? String(e.quantity).toLowerCase() : '';
      if (barcode.indexOf(term) > -1 || room.indexOf(term) > -1 || notes.indexOf(term) > -1 || quantity.indexOf(term) > -1) {
        filtered.push(e);
      }
    }
    appState.filteredEntries = filtered;
  }
  renderEntries();
}

export function refreshEntriesFromServer() {
  if (!hasServer() || !ensureAuth()) {
    showToast('Cannot refresh entries without API access.', 'error');
    return;
  }
  callApi('listEntries', appState.authToken, {})
    .then(function (entries) {
      if (entries && entries.splice) { appState.entries = entries; }
      else if (entries && entries.entries && entries.entries.splice) { appState.entries = entries.entries; }
      applyFilterAndRender();
      showToast('Entries refreshed.', 'success');
    })
    .catch(function (err) {
      console.log('listEntries error:', err);
      showToast('Could not refresh entries.', 'error');
    });
}

export function updateAdminUI() {
  if (appState.isAdmin) {
    dom.adminBar.style.display = 'flex';
  } else {
    dom.adminBar.style.display = 'none';
    appState.adminMode = false;
    if (dom.adminModeToggle) { dom.adminModeToggle.checked = false; }
  }
}

export function handleEntriesListClick(evt) {
  var target = evt.target || evt.srcElement;
  var actionEl = findAncestorWithAttr(target, 'data-action');
  if (!actionEl) { return; }
  var action = actionEl.getAttribute('data-action');
  var id = actionEl.getAttribute('data-id');
  if (!id) { return; }
  if (action === 'edit') {
    if (!appState.isAdmin) { return; }
    appState.editingEntryId = id;
    renderEntries();
  } else if (action === 'cancelEdit') {
    appState.editingEntryId = null;
    renderEntries();
  } else if (action === 'saveEdit') {
    if (!appState.isAdmin) { return; }
    saveEditedEntry(id);
  } else if (action === 'delete') {
    if (!appState.isAdmin) { return; }
    confirmDeleteEntry(id);
  }
}

function renderEntries() {
  dom.entriesList.innerHTML = '';
  var entries = appState.filteredEntries || [];
  var hasFilter = !!(appState.filterText && appState.filterText.trim());
  if (!entries.length) {
    var empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = hasFilter ? 'No results for this search.' : 'No entries yet.';
    dom.entriesList.appendChild(empty);
    return;
  }
  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var card = document.createElement('article');
    card.className = 'entry-card';
    card.setAttribute('data-entry-id', entry.id || '');
    if (appState.isAdmin && appState.adminMode && appState.editingEntryId === entry.id) {
      buildEntryEditContent(card, entry);
    } else {
      buildEntryDisplayContent(card, entry);
    }
    dom.entriesList.appendChild(card);
  }
}

function buildEntryDisplayContent(card, entry) {
  var rowMain = document.createElement('div');
  rowMain.className = 'entry-row-main';
  var barcodeEl = document.createElement('div');
  barcodeEl.className = 'entry-barcode';
  barcodeEl.textContent = entry.barcode || '(no barcode)';
  rowMain.appendChild(barcodeEl);
  var roomBadge = document.createElement('div');
  roomBadge.className = 'entry-room-badge';
  roomBadge.textContent = entry.room || '—';
  rowMain.appendChild(roomBadge);
  card.appendChild(rowMain);

  var meta = document.createElement('div');
  meta.className = 'entry-meta';
  var tsSpan = document.createElement('span');
  tsSpan.textContent = entry.timestamp || '';
  meta.appendChild(tsSpan);
  var qtyValue = parseInt(entry.quantity, 10);
  if (!qtyValue || qtyValue < 1) { qtyValue = 1; }
  var qtySpan = document.createElement('span');
  qtySpan.textContent = '• Qty: ' + qtyValue;
  meta.appendChild(qtySpan);
  if (entry.userEmail) {
    var userSpan = document.createElement('span');
    userSpan.textContent = '• ' + entry.userEmail;
    meta.appendChild(userSpan);
  }
  if (entry.imageUrl) {
    var imgSpan = document.createElement('span');
    imgSpan.textContent = '• 📷 image';
    meta.appendChild(imgSpan);
  }
  card.appendChild(meta);
  if (entry.notes) {
    var notesP = document.createElement('div');
    notesP.className = 'entry-notes';
    notesP.textContent = entry.notes;
    card.appendChild(notesP);
  }
  if (appState.isAdmin && appState.adminMode) {
    var actions = document.createElement('div');
    actions.className = 'entry-actions';
    var editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'btn btn-ghost';
    editBtn.setAttribute('data-action', 'edit');
    editBtn.setAttribute('data-id', entry.id || '');
    editBtn.textContent = 'Edit';
    actions.appendChild(editBtn);
    var delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'btn btn-danger';
    delBtn.setAttribute('data-action', 'delete');
    delBtn.setAttribute('data-id', entry.id || '');
    delBtn.textContent = 'Delete';
    actions.appendChild(delBtn);
    card.appendChild(actions);
  }
}

function buildEntryEditContent(card, entry) {
  var infoRow = document.createElement('div');
  infoRow.className = 'entry-row-main';
  var label = document.createElement('div');
  label.className = 'entry-barcode';
  label.textContent = 'Editing ' + (entry.barcode || '(no barcode)');
  infoRow.appendChild(label);
  card.appendChild(infoRow);

  var roomField = document.createElement('div');
  roomField.className = 'field';
  var roomSelect = document.createElement('select');
  roomSelect.setAttribute('data-edit-room-for', entry.id || '');
  for (var i = 0; i < appState.rooms.length; i++) {
    var r = appState.rooms[i];
    var opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    if (r === entry.room) { opt.selected = true; }
    roomSelect.appendChild(opt);
  }
  roomField.appendChild(roomSelect);
  card.appendChild(roomField);

  var qtyField = document.createElement('div');
  qtyField.className = 'field';
  var qtyLabel = document.createElement('label');
  var qtyId = 'edit-qty-' + (entry.id || 'row');
  qtyLabel.setAttribute('for', qtyId);
  qtyLabel.textContent = 'Quantity';
  qtyField.appendChild(qtyLabel);
  var qtyInput = document.createElement('input');
  qtyInput.type = 'number';
  qtyInput.min = '1';
  qtyInput.step = '1';
  qtyInput.className = 'pill-input';
  qtyInput.id = qtyId;
  qtyInput.setAttribute('data-edit-quantity-for', entry.id || '');
  var qtyValue = parseInt(entry.quantity, 10);
  if (!qtyValue || qtyValue < 1) { qtyValue = 1; }
  qtyInput.value = String(qtyValue);
  qtyField.appendChild(qtyInput);
  card.appendChild(qtyField);

  var notesArea = document.createElement('textarea');
  notesArea.setAttribute('data-edit-notes-for', entry.id || '');
  notesArea.rows = 2;
  notesArea.value = entry.notes || '';
  card.appendChild(notesArea);

  var actions = document.createElement('div');
  actions.className = 'entry-actions';
  var saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'btn btn-primary';
  saveBtn.setAttribute('data-action', 'saveEdit');
  saveBtn.setAttribute('data-id', entry.id || '');
  saveBtn.textContent = 'Save';
  actions.appendChild(saveBtn);
  var cancelBtn = document.createElement('button');
  cancelBtn.type = 'button';
  cancelBtn.className = 'btn btn-ghost';
  cancelBtn.setAttribute('data-action', 'cancelEdit');
  cancelBtn.setAttribute('data-id', entry.id || '');
  cancelBtn.textContent = 'Cancel';
  actions.appendChild(cancelBtn);
  card.appendChild(actions);
}

function saveEditedEntry(entryId) {
  if (!hasServer() || !ensureAuth()) {
    showToast('Cannot update entries without API access.', 'error');
    return;
  }

  var roomSelect = document.querySelector('select[data-edit-room-for="' + entryId + '"]');
  var notesArea = document.querySelector('textarea[data-edit-notes-for="' + entryId + '"]');
  var qtyInput = document.querySelector('input[data-edit-quantity-for="' + entryId + '"]');
  var newRoom = roomSelect ? (roomSelect.value || '').toString().trim() : '';
  var newNotes = notesArea ? (notesArea.value || '').toString() : '';
  var qtyValue = qtyInput ? parseInt(qtyInput.value, 10) : 1;
  if (!qtyValue || qtyValue < 1) { qtyValue = 1; }
  var payload = { id: entryId, room: newRoom, notes: newNotes, quantity: qtyValue };

  callApi('updateEntry', appState.authToken, payload)
    .then(function (updatedEntry) {
      var entries = appState.entries || [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id === entryId) { entries[i] = updatedEntry; break; }
      }
      appState.editingEntryId = null;
      applyFilterAndRender();
      showToast('Entry updated.', 'success');
    })
    .catch(function (err) {
      showToast('Could not update entry: ' + (err && err.message ? err.message : ''), 'error');
    });
}

function confirmDeleteEntry(entryId) {
  var sure = window.confirm ? window.confirm('Delete this entry?') : true;
  if (!sure) { return; }
  if (!hasServer() || !ensureAuth()) {
    showToast('Cannot delete entries without API access.', 'error');
    return;
  }
  callApi('deleteEntry', appState.authToken, { id: entryId })
    .then(function () {
      var entries = appState.entries || [];
      var remaining = [];
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].id !== entryId) { remaining.push(entries[i]); }
      }
      appState.entries = remaining;
      appState.editingEntryId = null;
      applyFilterAndRender();
      showToast('Entry deleted.', 'success');
    })
    .catch(function (err) {
      showToast('Could not delete entry: ' + (err && err.message ? err.message : ''), 'error');
    });
}
