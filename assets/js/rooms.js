/* ═══════════════════════════════════════════════════
   MODULE 3 — ROOM INFORMATION (ADD / EDIT / REMOVE)
   ═══════════════════════════════════════════════════ */

function saveRoomToServer(action, room) {
  if (IS_STANDALONE) return;
  fetch('api/rooms.php', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action,
      room_id: room.dbId,
      room_name_number: room.code,
      room_type: room.type,
      capacity: room.cap,
      floor_level: parseInt(room.floor, 10)
    })
  }).catch(() => {});
}

function renderRoomTable() {
  const tbody = document.getElementById('roomTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const isAdmin = canManageData();
  const btnAddRoom = document.getElementById('btnAddRoom');
  if (btnAddRoom) {
    btnAddRoom.style.display = isAdmin ? 'inline-flex' : 'none';
  }

  const countOf = type => ROOMS.filter(r => r.type === type).length;
  const setText = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  setText('statTotalRooms', ROOMS.length);
  setText('statLectureRooms', countOf('Lecture'));
  setText('statComputerLabs', countOf('CompLab'));
  setText('statTotalCapacity', ROOMS.reduce((sum, r) => sum + r.cap, 0));
  setText('roomSummaryText', `${countOf('Lecture')} lecture rooms, ${countOf('CompLab')} computer labs and ${countOf('Special')} specialized labs`);

  const sortChoice = document.getElementById('roomSortSelect')?.value || 'az';
  sortByChoice(ROOMS, sortChoice, r => r.dbId, r => r.code).forEach(room => {
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
      ? `<button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; margin-right:4px;" onclick="viewRoomSchedule(${jsArg(room.code)})">View Schedule</button>
         <button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; margin-right:4px;" onclick="openEditRoomModal(${jsArg(room.code)})">Edit</button>
         <button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px; color:var(--danger); border-color:#fadbd8;" onclick="promptDeleteRoom(${jsArg(room.code)})">Remove</button>`
      : `<button class="btn btn-outline" style="font-size:0.857rem; padding:3px 8px;" onclick="viewRoomSchedule(${jsArg(room.code)})">View Schedule</button>`;

    tr.innerHTML = `
      <td style="font-weight:700;">${escapeHtml(room.code)}</td>
      <td>${escapeHtml(room.floor)}</td>
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
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can add rooms.');
    return;
  }
  document.getElementById('roomModalTitle').textContent = 'Add Room';
  document.getElementById('roomEditOriginalCode').value = '';
  document.getElementById('roomCodeInput').value = '';
  document.getElementById('roomCodeInput').disabled = false;
  document.getElementById('roomFloorInput').value = '1F';
  document.getElementById('roomTypeInput').value = 'Lecture';
  document.getElementById('roomCapInput').value = '40';
  document.getElementById('roomModalSubmitBtn').textContent = 'Add Room';
  document.getElementById('roomModal').style.display = 'flex';
};

window.openEditRoomModal = function(code) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can edit rooms.');
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

window.submitRoomForm = async function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can save room changes.');
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

  const roomProblem = INPUT_RULES.code('Room code', code) || INPUT_RULES.int('Capacity', document.getElementById('roomCapInput').value, 1, 100);
  if (roomProblem) {
    alert(roomProblem);
    return;
  }

  if (origCode) {
    const room = ROOMS.find(r => r.code === origCode);
    if (room) {
      // Classes the room can no longer hold come off the schedule
      const updated = { ...room, floor, type, cap };
      const broken = MASTER_SCHEDULE_DATA.filter(c => {
        if (c.room !== origCode) return false;
        const termId = c.termId || getActiveAcademicContext().activeTerm.id;
        const sec = ACADEMIC_SECTIONS.find(s => s.code === c.section && s.termId === termId);
        const subj = sec && curriculumSubjectFor(sec, c.subjectCode, termId);
        return !!(sec && subj && roomFitProblem(updated, subj, sec));
      });
      if (!(await askToUnscheduleBroken(broken, `Change ${origCode}?`, `As a ${type} room with ${cap} seats, ${origCode} no longer fits some of its classes.`))) return;
      removeClassesAndSave(broken);
      room.floor = floor;
      room.type = type;
      room.cap = cap;
      saveRoomToServer('edit', room);
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
      cap
    });
    saveRoomToServer('add', ROOMS[ROOMS.length - 1]);
  }

  saveStateToStorage();
  closeRoomModal();
  renderRoomTable();
  renderScheduleViewer();
  renderGrid();
};

window.promptDeleteRoom = function(code) {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove rooms.');
    return;
  }
  const room = ROOMS.find(r => r.code === code);
  if (!room) return;
  const roomClasses = MASTER_SCHEDULE_DATA.filter(c => c.room === code);
  if (!IS_STANDALONE && roomClasses.length > 0) {
    const termCount = new Set(roomClasses.map(c => c.termId)).size;
    alert(`${code} can't be removed yet. It has ${roomClasses.length} scheduled class${roomClasses.length === 1 ? '' : 'es'}${termCount > 1 ? ` across ${termCount} terms` : ''}. Move them to another room first.`);
    return;
  }

  document.getElementById('deleteRoomTargetCode').value = room.code;
  document.getElementById('deleteRoomCodeDisplay').textContent = room.code;
  document.getElementById('deleteRoomDetailsDisplay').textContent = `${room.floor} · ${room.type} · ${room.cap} seats`;
  document.getElementById('deleteRoomModal').style.display = 'flex';
};

window.closeDeleteRoomModal = function() {
  document.getElementById('deleteRoomModal').style.display = 'none';
};

window.confirmDeleteRoom = function() {
  if (!canManageData()) {
    alert('Access Denied: Only the System Administrator or a Program Head can remove rooms.');
    return;
  }
  const code = document.getElementById('deleteRoomTargetCode').value;
  const deletedRoom = ROOMS.find(r => r.code === code);
  if (!IS_STANDALONE && MASTER_SCHEDULE_DATA.some(c => c.room === code)) {
    alert(`${code} still has scheduled classes. Move them to another room before removing it.`);
    closeDeleteRoomModal();
    return;
  }
  if (deletedRoom) saveRoomToServer('delete', deletedRoom);
  ROOMS = ROOMS.filter(r => r.code !== code);
  ACADEMIC_SECTIONS.forEach(s => {
    if (s.homeRoom === code) s.homeRoom = '';
  });
  if (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA)) {
    MASTER_SCHEDULE_DATA.forEach(c => {
      if (c.room === code) c.room = 'TBA';
    });
  }
  saveStateToStorage();
  closeDeleteRoomModal();
  renderRoomTable();
  renderScheduleViewer();
  renderGrid();
};

