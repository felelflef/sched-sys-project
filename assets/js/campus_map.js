/* ═══════════════════════════════════════════════════
   MODULE 2 — CAMPUS MINI MAP (All Labs on 1st Floor)
   ═══════════════════════════════════════════════════ */

function renderFloorMap(floor) {
  const canvas = document.getElementById('floorCanvas');
  if (!canvas) return;
  canvas.innerHTML = '';

  const floorRooms = ROOMS.filter(r => r.floor === floor);
  const statuses = ['available', 'occupied', 'available', 'partial', 'occupied'];

  floorRooms.forEach((room, i) => {
    const status = statuses[i % statuses.length];
    const cell = document.createElement('div');
    cell.className = `room-cell ${status}`;
    cell.style.cursor = 'pointer';
    cell.innerHTML = `
      <div class="room-status-dot"></div>
      <div class="room-id">${room.code}</div>
      <div class="room-type">${room.type === 'CompLab' ? '💻 Computer Lab' : '📚 Lecture Room'}</div>
      <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">${room.cap} seats</div>
      <div style="font-size:9.5px; color:var(--accent-primary); font-weight:600; margin-top:6px;">View Schedule →</div>
    `;
    cell.addEventListener('click', () => {
      showRoomSchedule(room.code);
    });
    canvas.appendChild(cell);
  });
}

window.showRoomSchedule = function(roomCode) {
  const room = ROOMS.find(r => r.code === roomCode);
  if (!room) return;

  document.getElementById('schedModalRoomCode').textContent = `${room.code} Timetable`;
  document.getElementById('schedModalRoomMeta').textContent = `${room.floor} · ${room.type === 'CompLab' ? 'Computer Lab' : 'Lecture Room'} · Capacity: ${room.cap} seats`;

  const tbody = document.getElementById('schedModalTableBody');
  tbody.innerHTML = '';

  TIME_SLOTS.forEach((slot, si) => {
    const tr = document.createElement('tr');
    const block = scheduleData[room.code]?.[si];

    if (block) {
      const typeBadge = block.type === 'conflict' ? 'badge-danger' : block.type === 'manual-override' ? 'badge-warning' : 'badge-lab';
      tr.innerHTML = `
        <td style="font-weight:600; font-size:12px; color:var(--text-primary);">${slot}</td>
        <td>
          <div style="font-weight:600; font-size:13px; color:var(--accent-primary);">${block.subj}</div>
          <span class="badge ${typeBadge}" style="font-size:10px; margin-top:3px;">${block.type}</span>
        </td>
        <td style="font-size:12.5px;">${block.faculty}</td>
        <td><span class="qual-tag" style="background:#EEF1F7; color:var(--accent-primary); font-weight:600;">${block.section}</span></td>
      `;
    } else {
      tr.innerHTML = `
        <td style="font-weight:600; font-size:12px; color:var(--text-primary);">${slot}</td>
        <td colspan="3" style="color:var(--text-secondary); font-size:12px; font-style:italic;">
          <span class="badge badge-success" style="font-size:10px; margin-right:6px;">Available</span> Vacant Slot
        </td>
      `;
    }
    tbody.appendChild(tr);
  });

  document.getElementById('roomScheduleModal').style.display = 'flex';
};

window.closeRoomScheduleModal = function() {
  document.getElementById('roomScheduleModal').style.display = 'none';
};

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.floor-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.floor-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderFloorMap(tab.dataset.floor + 'F');
    });
  });
});
