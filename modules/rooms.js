import { appState } from './state.js';
import { dom } from './dom.js';

export function openRoomSheet() {
  renderRoomList();
  dom.roomSheet.classList.add('open');
  dom.roomSheet.setAttribute('aria-hidden', 'false');
}

export function closeRoomSheet() {
  dom.roomSheet.classList.remove('open');
  dom.roomSheet.setAttribute('aria-hidden', 'true');
}

export function populateRooms(rooms) {
  appState.rooms = rooms || [];
  dom.selectRoom.innerHTML = '';
  var opt = document.createElement('option');
  opt.value = '';
  opt.textContent = 'Choose room…';
  dom.selectRoom.appendChild(opt);
  for (var i = 0; i < appState.rooms.length; i++) {
    var room = appState.rooms[i];
    var o = document.createElement('option');
    o.value = room;
    o.textContent = room;
    dom.selectRoom.appendChild(o);
  }
}

function renderRoomList() {
  dom.roomList.innerHTML = '';
  if (!appState.rooms || !appState.rooms.length) {
    var empty = document.createElement('div');
    empty.className = 'muted';
    empty.textContent = 'No rooms available.';
    dom.roomList.appendChild(empty);
    return;
  }
  for (var i = 0; i < appState.rooms.length; i++) {
    (function (room) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'room-chip';
      btn.textContent = room;
      btn.onclick = function () { selectRoom(room); };
      dom.roomList.appendChild(btn);
    })(appState.rooms[i]);
  }
}

function selectRoom(room) {
  dom.selectRoom.value = room || '';
  dom.roomDisplay.textContent = room || 'Select a room';
  closeRoomSheet();
}
