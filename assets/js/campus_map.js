/* ═══════════════════════════════════════════════════
   MODULE 2 — CAMPUS MINI MAP & REAL-TIME LINKAGE
   ═══════════════════════════════════════════════════ */

/**
 * Synchronize any rooms found in MASTER_SCHEDULE_DATA into ROOMS catalog
 * so no classroom ever disappears from the Campus Map.
 */
function syncMasterScheduleRoomsWithCatalog() {
  if (typeof MASTER_SCHEDULE_DATA === 'undefined' || !Array.isArray(MASTER_SCHEDULE_DATA)) return;

  MASTER_SCHEDULE_DATA.forEach(c => {
    if (!c.room || c.room === 'TBA') return;
    const roomCode = c.room.trim();
    const exists = ROOMS.some(r => r.code.toUpperCase() === roomCode.toUpperCase());
    if (!exists) {
      // Determine probable floor
      let floor = '1F';
      if (roomCode.includes('20') || roomCode.startsWith('LR-2')) floor = '2F';
      else if (roomCode.includes('30') || roomCode.startsWith('LR-3')) floor = '3F';

      let type = 'Lecture';
      if (roomCode.toLowerCase().includes('lab') || roomCode.startsWith('CL-')) type = 'CompLab';
      else if (roomCode.toLowerCase().includes('kitchen') || roomCode.toLowerCase().includes('tourism')) type = 'Special';

      ROOMS.push({
        code: roomCode,
        floor: floor,
        type: type,
        cap: 40,
        util: 75,
        name: roomCode
      });
    }
  });
}

/**
 * Returns formatted human-readable type and icon for a room
 */
function getRoomDisplayInfo(room) {
  const code = (room.code || '').toUpperCase();
  if (code === 'KITCHEN LAB' || code.includes('KITCHEN')) {
    return { icon: '🍳', label: 'Culinary Arts Lab', badgeClass: 'badge-warning', type: 'Special' };
  }
  if (code === 'TOURISM LAB' || code.includes('TOURISM')) {
    return { icon: '✈️', label: 'Tourism Mock Center', badgeClass: 'badge-warning', type: 'Special' };
  }
  if (room.type === 'CompLab' || code.startsWith('CL-')) {
    return { icon: '💻', label: 'Computer Lab', badgeClass: 'badge-lab', type: 'CompLab' };
  }
  if (room.type === 'Special') {
    return { icon: '🏛️', label: 'Specialized Facility', badgeClass: 'badge-warning', type: 'Special' };
  }
  return { icon: '📚', label: 'Lecture Room', badgeClass: 'badge-lecture', type: 'Lecture' };
}

/**
 * Returns class schedules filtered for the active Academic Year and Term
 */
function getActiveMapSchedules() {
  const { activeSy, activeTerm } = (typeof getActiveAcademicContext === 'function')
    ? getActiveAcademicContext()
    : {
        activeSy: (typeof SCHOOL_YEARS !== 'undefined' ? SCHOOL_YEARS.find(y => y.isActive) : null) || { id: 1, yearCode: 'AY 2026-2027' },
        activeTerm: (typeof SCHOOL_TERMS !== 'undefined' ? SCHOOL_TERMS.find(t => t.isActive) : null) || { id: 1, termName: '1st Sem' }
      };

  const masterSched = (typeof MASTER_SCHEDULE_DATA !== 'undefined' && Array.isArray(MASTER_SCHEDULE_DATA))
    ? MASTER_SCHEDULE_DATA
    : [];

  if (!activeTerm) return masterSched;

  return masterSched.filter(c => {
    if (c.termId) {
      return c.termId === activeTerm.id;
    }
    if (typeof ACADEMIC_SECTIONS !== 'undefined' && c.section) {
      const sec = ACADEMIC_SECTIONS.find(s => s.code === c.section);
      if (sec && sec.termId) return sec.termId === activeTerm.id;
    }
    return activeTerm.id === 1;
  });
}

function syncCampusMapSyFilter() {
  const sel = document.getElementById('campusMapSyFilter');
  if (!sel || typeof SCHOOL_YEARS === 'undefined') return;

  const activeSy = SCHOOL_YEARS.find(y => y.isActive) || SCHOOL_YEARS[0];
  sel.innerHTML = SCHOOL_YEARS.map(y => `<option value="${y.id}" ${y.isActive ? 'selected' : ''}>${escapeHtml(y.yearCode)}${y.isActive ? ' (Active)' : ''}</option>`).join('');
  if (activeSy) sel.value = String(activeSy.id);
}

/**
 * Returns 'available', 'occupied' or 'ending' for a room's classes at this moment
 */
function getRoomLiveStatus(roomClasses, now = new Date()) {
  const today = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  const current = roomClasses.find(c =>
    c.day === today && timeToMinutes(c.startTime) <= minutes && minutes < timeToMinutes(c.endTime)
  );
  if (!current) return 'available';
  return timeToMinutes(current.endTime) - minutes <= 15 ? 'ending' : 'occupied';
}

/**
 * Renders the room grid for a given floor (1F, 2F, or 3F)
 */
function renderFloorMap(floor) {
  syncMasterScheduleRoomsWithCatalog();
  syncCampusMapSyFilter();

  const canvas = document.getElementById('floorCanvas');
  if (!canvas) return;
  canvas.innerHTML = '';

  const floorRooms = ROOMS.filter(r => r.floor === floor);
  const masterSched = getActiveMapSchedules();

  floorRooms.forEach(room => {
    const info = getRoomDisplayInfo(room);
    const assignedClasses = masterSched.filter(c =>
      c.room && c.room.trim().toUpperCase() === room.code.trim().toUpperCase()
    );

    // Status for this moment, matching the map legend
    const liveStatus = getRoomLiveStatus(assignedClasses);
    const status = liveStatus === 'ending' ? 'partial' : liveStatus;
    const statusLabel = { available: 'Available', occupied: 'Occupied', ending: 'Ending Soon' }[liveStatus];

    const cell = document.createElement('div');
    cell.className = `room-cell ${status}`;
    cell.id = `map-room-${room.code.replace(/[^a-zA-Z0-9]/g, '_')}`;
    cell.style.cursor = 'pointer';

    const classCountText = assignedClasses.length > 0
      ? `<span style="font-weight:700; color:var(--accent-primary);">${assignedClasses.length} class${assignedClasses.length > 1 ? 'es' : ''} scheduled</span>`
      : `<span style="color:var(--success); font-weight:600;">✓ Fully Available</span>`;

    cell.innerHTML = `
      <div class="room-status-dot" title="${statusLabel}"></div>
      <div class="room-id" style="display:flex; align-items:center; justify-content:center; gap:4px;">
        <span>${info.icon}</span>
        <span>${escapeHtml(room.code)}</span>
      </div>
      <div class="room-type">${info.label}</div>
      <div style="font-size:10.5px; color:var(--text-secondary); margin-top:4px;">${room.cap} seats</div>
      <div style="font-size:10px; margin-top:6px; padding:2px 4px; background:rgba(255,255,255,0.7); border-radius:4px;">${classCountText}</div>
      <div style="font-size:9.5px; color:var(--accent-primary); font-weight:700; margin-top:6px; display:flex; align-items:center; justify-content:center; gap:3px;">
        View Timetable →
      </div>
    `;

    cell.addEventListener('click', () => {
      showRoomSchedule(room.code);
    });

    canvas.appendChild(cell);
  });

  updateCampusMapStats();
}

/**
 * Dynamically updates utilization metrics on the Campus Map page
 */
function updateCampusMapStats() {
  const masterSched = getActiveMapSchedules();

  const totalRooms = ROOMS.length;
  if (totalRooms === 0) return;

  // Set of rooms with at least 1 class
  const scheduledRooms = new Set();
  masterSched.forEach(c => {
    if (c.room && c.room !== 'TBA') {
      const match = ROOMS.find(r => r.code.toUpperCase() === c.room.trim().toUpperCase());
      if (match) scheduledRooms.add(match.code);
    }
  });

  // Occupied and ending-soon counts reflect this moment; utilization covers the whole week
  const liveStatuses = ROOMS.map(room => getRoomLiveStatus(
    masterSched.filter(c => c.room && c.room.trim().toUpperCase() === room.code.trim().toUpperCase())
  ));
  const endingSoonCount = liveStatuses.filter(s => s === 'ending').length;
  const occupiedCount = liveStatuses.filter(s => s === 'occupied').length + endingSoonCount;
  const availableCount = totalRooms - occupiedCount;
  const overallUtilPercent = Math.round((scheduledRooms.size / totalRooms) * 100);

  const elAvail = document.getElementById('statAvailableRooms');
  if (elAvail) elAvail.textContent = String(availableCount);

  const elOcc = document.getElementById('statOccupiedRooms');
  if (elOcc) elOcc.textContent = String(occupiedCount);

  const elEnding = document.getElementById('statEndingSoonRooms');
  if (elEnding) elEnding.textContent = String(endingSoonCount);

  const elUtil = document.getElementById('statOverallUtil');
  if (elUtil) elUtil.textContent = `${overallUtilPercent}%`;

  // Utilization by Floor
  ['1F', '2F', '3F'].forEach(fl => {
    const flRooms = ROOMS.filter(r => r.floor === fl);
    const flScheduled = flRooms.filter(r => scheduledRooms.has(r.code)).length;
    const flPercent = flRooms.length > 0 ? Math.round((flScheduled / flRooms.length) * 100) : 0;

    const fillBar = document.getElementById(`utilBar${fl}`);
    const valText = document.getElementById(`utilVal${fl}`);
    if (fillBar) fillBar.style.width = `${flPercent}%`;
    if (valText) valText.textContent = `${flPercent}%`;
  });
}

/**
 * Display timetable modal for any room, populated directly from MASTER_SCHEDULE_DATA
 */
window.showRoomSchedule = function(roomCode) {
  syncMasterScheduleRoomsWithCatalog();

  const cleanCode = (roomCode || '').trim();
  const room = ROOMS.find(r => r.code.toUpperCase() === cleanCode.toUpperCase()) ||
               ROOMS.find(r => r.code.toLowerCase().includes(cleanCode.toLowerCase()));
  if (!room) return;

  const info = getRoomDisplayInfo(room);

  const { activeSy, activeTerm } = (typeof getActiveAcademicContext === 'function')
    ? getActiveAcademicContext()
    : {
        activeSy: (typeof SCHOOL_YEARS !== 'undefined' ? SCHOOL_YEARS.find(y => y.isActive) : null) || { yearCode: 'AY 2026-2027' },
        activeTerm: (typeof SCHOOL_TERMS !== 'undefined' ? SCHOOL_TERMS.find(t => t.isActive) : null) || { termName: '1st Sem' }
      };

  const titleEl = document.getElementById('schedModalRoomCode');
  if (titleEl) {
    titleEl.innerHTML = `${info.icon} ${escapeHtml(room.code)} Timetable`;
  }

  const metaEl = document.getElementById('schedModalRoomMeta');
  if (metaEl) {
    const floorLabel = room.floor === '1F' ? '1st Floor' : room.floor === '2F' ? '2nd Floor' : '3rd Floor';
    metaEl.textContent = `${floorLabel} · ${info.label} · Seating Capacity: ${room.cap} seats · [${activeTerm.termName} ${activeSy.yearCode}]`;
  }

  const tbody = document.getElementById('schedModalTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  const masterSched = getActiveMapSchedules();

  const roomClasses = masterSched.filter(c =>
    c.room && c.room.trim().toUpperCase() === room.code.trim().toUpperCase()
  );

  // Sort by Day of Week then Start Time
  const dayOrder = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  roomClasses.sort((a, b) => {
    const dDiff = (dayOrder[a.day] || 9) - (dayOrder[b.day] || 9);
    if (dDiff !== 0) return dDiff;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  if (roomClasses.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="4" style="text-align:center; padding:32px 16px; color:var(--text-secondary);">
        <div style="font-size:28px; margin-bottom:8px;">🟢</div>
        <div style="font-weight:800; color:var(--text-primary); font-size:14px;">No Scheduled Classes in ${escapeHtml(room.code)}</div>
        <div style="font-size:12px; color:var(--text-secondary); margin-top:4px;">
          This classroom is completely vacant and available for booking across all days.
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  } else {
    roomClasses.forEach(c => {
      const tr = document.createElement('tr');
      const timeStr = (c.startTime && c.endTime)
        ? `${formatTime12(c.startTime)} – ${formatTime12(c.endTime)}`
        : (c.time || 'TBA');

      let typeBadgeClass = 'badge-lecture';
      if (c.type === 'lab') typeBadgeClass = 'badge-lab';
      else if (c.type === 'pe' || c.type === 'special') typeBadgeClass = 'badge-warning';

      tr.innerHTML = `
        <td style="font-weight:600; font-size:12px; color:var(--text-primary); vertical-align:middle; white-space:nowrap;">
          <span class="badge" style="background:#25447A; color:#FFFFFF; font-size:10.5px; font-weight:700; margin-right:6px; padding:2px 6px;">
            ${escapeHtml(c.day)}
          </span>
          <span>${escapeHtml(timeStr)}</span>
        </td>
        <td style="vertical-align:middle;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <strong style="color:var(--accent-primary); font-size:13px;">${escapeHtml(c.subjectCode)}</strong>
            <span class="badge ${typeBadgeClass}" style="font-size:9.5px; text-transform:uppercase;">
              ${escapeHtml(c.type || 'Lecture')}
            </span>
          </div>
          <div style="font-size:11.5px; color:var(--text-secondary); margin-top:2px;">
            ${escapeHtml(c.subjectTitle || '')}
          </div>
        </td>
        <td style="font-size:12.5px; color:var(--text-primary); vertical-align:middle;">
          👨‍🏫 ${escapeHtml(c.instructor || 'Unassigned')}
        </td>
        <td style="vertical-align:middle; text-align:right;">
          <button class="btn btn-outline" style="font-size:11px; padding:3px 10px; font-weight:700; display:inline-flex; align-items:center; gap:4px;" onclick="viewSectionOnMasterSchedule(${jsArg(c.section)})">
            <span>${escapeHtml(c.section)}</span>
            <span style="font-size:12px;">↗</span>
          </button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  const modal = document.getElementById('roomScheduleModal');
  if (modal) modal.style.display = 'flex';
};

/**
 * Close room timetable modal
 */
window.closeRoomScheduleModal = function() {
  const modal = document.getElementById('roomScheduleModal');
  if (modal) modal.style.display = 'none';
};

/**
 * Jump from Room Timetable Modal directly into the Master Schedule with that section selected
 */
window.viewSectionOnMasterSchedule = function(sectionCode) {
  closeRoomScheduleModal();

  // Navigate to Master Schedule page
  const navItem = document.querySelector('.nav-item[data-module="schedule"]');
  if (navItem) navItem.click();

  // Reset filters to 'all' to ensure target section is visible in dropdown
  const progFilter = document.getElementById('programFilter');
  if (progFilter) progFilter.value = 'all';

  const yrFilter = document.getElementById('yearFilter');
  if (yrFilter) yrFilter.value = 'all';

  if (typeof updateSectionDropdown === 'function') {
    updateSectionDropdown();
  }

  const sectionSelect = document.getElementById('sectionSelect');
  if (sectionSelect) {
    sectionSelect.value = sectionCode;
  }

  if (typeof currentSelectedSection !== 'undefined') {
    currentSelectedSection = sectionCode;
  }

  if (typeof renderGrid === 'function') {
    renderGrid();
  }

  // Smooth scroll to timetable sheet
  const card = document.getElementById('sectionTimetableCard');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.style.outline = '3px solid #25447A';
    setTimeout(() => { card.style.outline = 'none'; }, 2000);
  }
};

/**
 * Jump from Master Schedule (class detail modal) directly onto Campus Map, selecting the floor,
 * highlighting the room, and opening its full timetable
 */
window.viewRoomOnCampusMap = function(roomCode) {
  if (typeof closeClassDetailModal === 'function') {
    closeClassDetailModal();
  }

  syncMasterScheduleRoomsWithCatalog();

  const cleanCode = (roomCode || '').trim();
  const room = ROOMS.find(r => r.code.toUpperCase() === cleanCode.toUpperCase()) ||
               ROOMS.find(r => r.code.toLowerCase().includes(cleanCode.toLowerCase()));

  // Navigate to Campus Map page
  const navItem = document.querySelector('.nav-item[data-module="minimap"]');
  if (navItem) navItem.click();

  const targetFloor = room ? room.floor : '1F';
  const floorNum = targetFloor.replace('F', '');

  // Activate matching floor tab
  document.querySelectorAll('.floor-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.floor === floorNum);
  });

  renderFloorMap(targetFloor);

  // Highlight room cell and open timetable modal
  setTimeout(() => {
    if (room) {
      const cellId = `map-room-${room.code.replace(/[^a-zA-Z0-9]/g, '_')}`;
      const cell = document.getElementById(cellId);
      if (cell) {
        cell.scrollIntoView({ behavior: 'smooth', block: 'center' });
        cell.classList.add('highlight-pulse');
        setTimeout(() => cell.classList.remove('highlight-pulse'), 3500);
      }
      showRoomSchedule(room.code);
    }
  }, 120);
};

// Floor tab event listener
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.floor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.floor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFloorMap(tab.dataset.floor + 'F');
    });
  });
});

// Keep the live room status current while the map is open
setInterval(() => {
  if (document.getElementById('page-minimap')?.classList.contains('active')) {
    const activeFloor = document.querySelector('.floor-tab.active')?.dataset.floor || '1';
    renderFloorMap(activeFloor + 'F');
  }
}, 60000);
