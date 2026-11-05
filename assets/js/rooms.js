/* ═══════════════════════════════════════════════════
   MODULE 3 — ROOM INFORMATION (ADD / EDIT / REMOVE)
   ═══════════════════════════════════════════════════ */

function renderRoomTable() {
  const tbody = document.getElementById('roomTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isAdmin = CURRENT_USER && CURRENT_USER.role === 'admin';
  const btnAddRoom = document.getElementById('btnAddRoom');
  if (btnAddRoom) {
    btnAddRoom.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  ROOMS.forEach(room => {
    const tr = document.createElement('tr');
    let typeBadge = 'badge-lecture';
    let typeLabel = '📚 Lecture Room';

    if (room.type === 'CompLab' || room.code.startsWith('CL-')) {
      typeBadge = 'badge-lab';
      typeLabel = '💻 Computer Lab';
    } else if (room.type === 'Special' || room.code.includes('Lab')) {
      typeBadge = 'badge-warning';
      if (room.code === 'Kitchen Lab') typeLabel = '🍳 Culinary Lab';
      else if (room.code === 'Tourism Lab') typeLabel = '✈️ Tourism Lab';
      else typeLabel = '🏛️ Special Facility';
    }

    const actionButtons = isAdmin
      ? `<button class="btn btn-outline" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="viewRoomOnCampusMap('${room.code}')">View on Map</button>
         <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; margin-right:4px;" onclick="openEditRoomModal('${room.code}')">Edit</button>
         <button class="btn btn-outline" style="font-size:11px; padding:3px 8px; color:var(--danger); border-color:#fadbd8;" onclick="promptDeleteRoom('${room.code}')">Remove</button>`
      : `<button class="btn btn-outline" style="font-size:11px; padding:3px 8px;" onclick="viewRoomOnCampusMap('${room.code}')">View on Map</button>`;

    tr.innerHTML = `
      <td style="font-weight:700;">${room.code}</td>
      <td>${room.floor}</td>
      <td><span class="badge ${typeBadge}">${typeLabel}</span></td>
      <td>${room.cap} seats</td>
      <td style="text-align:right;">
        ${actionButtons}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.openAddRoomModal = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to add rooms.');
    return;
  }
  document.getElementById('roomModalTitle').textContent = 'Add Room';
  document.getElementById('roomEditOriginalCode').value = '';
  document.getElementById('roomCodeInput').value = '';
  document.getElementById('roomCodeInput').disabled = false;
  document.getElementById('roomFloorInput').value = '1F';
  document.getElementById('roomTypeInput').value = 'Lecture';
  document.getElementById('roomCapInput').value = '45';
  document.getElementById('roomModalSubmitBtn').textContent = 'Add Room';
  document.getElementById('roomModal').style.display = 'flex';
};

window.openEditRoomModal = function(code) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to edit rooms.');
    return;
  }
  const room = ROOMS.find(r => r.code === code);
  if (!room) return;
  document.getElementById('roomModalTitle').textContent = `Edit Room (${room.code})`;
  document.getElementById('roomEditOriginalCode').value = room.code;
  document.getElementById('roomCodeInput').value = room.code;
  document.getElementById('roomCodeInput').disabled = true;
  document.getElementById('roomFloorInput').value = room.floor;
  document.getElementById('roomTypeInput').value = room.type;
  document.getElementById('roomCapInput').value = room.cap;
  document.getElementById('roomModalSubmitBtn').textContent = 'Save Changes';
  document.getElementById('roomModal').style.display = 'flex';
};

window.closeRoomModal = function() {
  document.getElementById('roomModal').style.display = 'none';
};

window.submitRoomForm = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to save room changes.');
    closeRoomModal();
    return;
  }
  const origCode = document.getElementById('roomEditOriginalCode').value;
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  const floor = document.getElementById('roomFloorInput').value;
  const type = document.getElementById('roomTypeInput').value;
  const cap = parseInt(document.getElementById('roomCapInput').value, 10);

  if (!code || isNaN(cap) || cap < 1) {
    alert('Please provide a valid room code and positive capacity.');
    return;
  }

  if (origCode) {
    const room = ROOMS.find(r => r.code === origCode);
    if (room) {
      room.floor = floor;
      room.type = type;
      room.cap = cap;
    }
  } else {
    if (ROOMS.some(r => r.code === code)) {
      alert(`Room ${code} already exists.`);
      return;
    }
    ROOMS.push({
      code,
      floor,
      type,
      cap,
      util: Math.floor(Math.random() * 30 + 60)
    });
  }

  closeRoomModal();
  renderRoomTable();
  const activeFloor = document.querySelector('.floor-tab.active')?.dataset.floor || '1';
  renderFloorMap(activeFloor + 'F');
  renderGrid();
};

window.promptDeleteRoom = function(code) {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove rooms.');
    return;
  }
  const room = ROOMS.find(r => r.code === code);
  if (!room) return;

  document.getElementById('deleteRoomTargetCode').value = room.code;
  document.getElementById('deleteRoomCodeDisplay').textContent = room.code;
  document.getElementById('deleteRoomDetailsDisplay').textContent = `${room.floor} · ${room.type} · ${room.cap} seats`;
  document.getElementById('deleteRoomModal').style.display = 'flex';
};

window.closeDeleteRoomModal = function() {
  document.getElementById('deleteRoomModal').style.display = 'none';
};

window.confirmDeleteRoom = function() {
  if (!CURRENT_USER || CURRENT_USER.role !== 'admin') {
    alert('Access Denied: Only system administrators are authorized to remove rooms.');
    return;
  }
  const code = document.getElementById('deleteRoomTargetCode').value;
  ROOMS = ROOMS.filter(r => r.code !== code);
  if (typeof scheduleData !== 'undefined' && scheduleData && scheduleData[code]) {
    delete scheduleData[code];
  }
  if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
    MASTER_SCHEDULE_DATA.forEach(c => {
      if (c.room === code) c.room = 'TBA';
    });
  }
  closeDeleteRoomModal();
  renderRoomTable();
  const activeFloor = document.querySelector('.floor-tab.active')?.dataset.floor || '1';
  renderFloorMap(activeFloor + 'F');
  renderGrid();
};

// Backward-compatible alias
window.deleteRoom = window.promptDeleteRoom;
